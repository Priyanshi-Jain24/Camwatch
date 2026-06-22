from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import aliased
from typing import List, Optional

from app.db.session import get_db
from app.models import Device, Site, DeviceType, DeviceStatus, CheckLog, CheckType, Alert, RtspMode
from app.schemas import DeviceCreate, DeviceUpdate, DeviceOut, DeviceDetail, CheckLogOut, AlertOut
from app.api.deps import get_current_admin, get_current_user
from app.services.device_urls import build_rtsp_url, normalize_vendor

router = APIRouter()


async def latest_ping_latency(db: AsyncSession, device_id: str) -> Optional[float]:
    result = await db.execute(
        select(CheckLog.latency_ms)
        .where(CheckLog.device_id == device_id, CheckLog.check_type == CheckType.ping)
        .order_by(CheckLog.checked_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def validate_nvr_link(
    db: AsyncSession,
    *,
    nvr_id: Optional[str],
    site_id: str,
    device_id: Optional[str] = None,
):
    if not nvr_id:
        return
    if device_id and nvr_id == device_id:
        raise HTTPException(status_code=400, detail="Device cannot be linked to itself as an NVR")

    result = await db.execute(
        select(Device).where(
            Device.id == nvr_id,
            Device.is_active == True,
        )
    )
    nvr = result.scalar_one_or_none()
    if not nvr:
        raise HTTPException(status_code=404, detail="Linked NVR not found")
    if nvr.device_type != DeviceType.nvr:
        raise HTTPException(status_code=400, detail="Linked device must be an NVR")
    if nvr.site_id != site_id:
        raise HTTPException(status_code=400, detail="Linked NVR must belong to the same site")


async def has_linked_cameras(db: AsyncSession, nvr_id: str) -> bool:
    result = await db.execute(
        select(Device.id).where(
            Device.nvr_id == nvr_id,
            Device.device_type == DeviceType.camera,
            Device.is_active == True,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


@router.get("/", response_model=List[DeviceOut])
async def list_devices(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    site_id: Optional[str] = None,
    device_type: Optional[DeviceType] = None,
    status: Optional[DeviceStatus] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    Nvr = aliased(Device)
    q = (
        select(Device, Site.name.label("site_name"), Nvr.name.label("nvr_name"))
        .join(Site, Device.site_id == Site.id)
        .outerjoin(Nvr, Device.nvr_id == Nvr.id)
        .where(Device.is_active == True, Site.is_active == True)
    )
    if site_id:
        q = q.where(Device.site_id == site_id)
    if device_type:
        q = q.where(Device.device_type == device_type)
    if status:
        q = q.where(Device.status == status)
    q = q.offset(skip).limit(limit)
    result = await db.execute(q)
    rows = result.all()

    out = []
    for row in rows:
        d = DeviceOut.model_validate(row[0])
        d.site_name = row[1]
        d.nvr_name = row[2]
        d.latest_ping_latency_ms = await latest_ping_latency(db, row[0].id)
        d.latest_ping_packet_loss_pct = row[0].ping_packet_loss_pct
        out.append(d)
    return out


@router.post("/", response_model=DeviceOut, status_code=201)
async def create_device(
    device_in: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    # verify site exists
    site_result = await db.execute(select(Site).where(Site.id == device_in.site_id))
    if not site_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Site not found")
    if device_in.device_type == DeviceType.nvr and device_in.nvr_id:
        raise HTTPException(status_code=400, detail="NVR devices cannot be linked to another NVR")
    await validate_nvr_link(db, nvr_id=device_in.nvr_id, site_id=device_in.site_id)

    payload = device_in.model_dump()
    payload["vendor"] = normalize_vendor(device_in.vendor)
    payload["rtsp_url"] = build_rtsp_url(
        device_type=device_in.device_type,
        ip_address=device_in.ip_address,
        rtsp_port=device_in.rtsp_port,
        username=device_in.username,
        password=device_in.password,
        vendor=payload["vendor"],
        rtsp_stream_type=device_in.rtsp_stream_type,
        rtsp_mode=device_in.rtsp_mode,
        rtsp_url=device_in.rtsp_url,
    )
    device = Device(**payload)
    db.add(device)
    await db.flush()
    await db.refresh(device)
    return DeviceOut.model_validate(device)


@router.get("/{device_id}", response_model=DeviceDetail)
async def get_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(Device, Site.name.label("site_name"))
        .join(Site, Device.site_id == Site.id)
        .where(Device.id == device_id, Device.is_active == True, Site.is_active == True)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Device not found")

    device, site_name = row
    d = DeviceDetail.model_validate(device)
    d.site_name = site_name
    d.latest_ping_latency_ms = await latest_ping_latency(db, device_id)
    d.latest_ping_packet_loss_pct = device.ping_packet_loss_pct

    # Recent checks (last 20)
    checks_result = await db.execute(
        select(CheckLog)
        .where(CheckLog.device_id == device_id)
        .order_by(CheckLog.checked_at.desc())
        .limit(20)
    )
    d.recent_checks = [CheckLogOut.model_validate(c) for c in checks_result.scalars().all()]

    # Open alerts
    alerts_result = await db.execute(
        select(Alert)
        .where(Alert.device_id == device_id, Alert.status == "open")
        .order_by(Alert.created_at.desc())
    )
    d.open_alerts = [AlertOut.model_validate(a) for a in alerts_result.scalars().all()]

    return d


@router.put("/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: str,
    device_in: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    data = device_in.model_dump(exclude_unset=True)
    final_site_id = data.get("site_id", device.site_id)
    final_type = data.get("device_type", device.device_type)
    final_nvr_id = data.get("nvr_id", device.nvr_id)
    if "vendor" in data:
        data["vendor"] = normalize_vendor(data["vendor"])

    if "site_id" in data:
        site_result = await db.execute(select(Site).where(Site.id == final_site_id))
        if not site_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Site not found")
    if device.device_type == DeviceType.nvr and await has_linked_cameras(db, device.id):
        if final_type != DeviceType.nvr:
            raise HTTPException(status_code=400, detail="Cannot change an NVR to a camera while cameras are linked to it")
        if final_site_id != device.site_id:
            raise HTTPException(status_code=400, detail="Cannot move an NVR to another site while cameras are linked to it")
        if data.get("is_active") is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate an NVR while cameras are linked to it")
    if final_type == DeviceType.nvr:
        final_nvr_id = None
        data["nvr_id"] = None
    await validate_nvr_link(db, nvr_id=final_nvr_id, site_id=final_site_id, device_id=device.id)

    if any(
        field in data
        for field in ("device_type", "ip_address", "rtsp_port", "username", "password", "vendor", "rtsp_mode", "rtsp_stream_type", "rtsp_url")
    ):
        final_rtsp_mode = data.get("rtsp_mode") or RtspMode(device.rtsp_mode or RtspMode.auto.value)
        previous_generated_rtsp = build_rtsp_url(
            device_type=device.device_type,
            ip_address=device.ip_address,
            rtsp_port=device.rtsp_port,
            username=device.username,
            password=device.password,
            vendor=device.vendor,
            rtsp_stream_type=device.rtsp_stream_type,
            rtsp_mode=RtspMode.auto,
            rtsp_url=None,
        )
        requested_rtsp_url = data.get("rtsp_url")
        if (
            final_rtsp_mode == RtspMode.auto
            and
            requested_rtsp_url == device.rtsp_url
            and device.rtsp_url
            and device.rtsp_url == previous_generated_rtsp
        ):
            requested_rtsp_url = None

        data["rtsp_url"] = build_rtsp_url(
            device_type=final_type,
            ip_address=data.get("ip_address", device.ip_address),
            rtsp_port=data.get("rtsp_port", device.rtsp_port),
            username=data.get("username", device.username),
            password=data.get("password", device.password),
            vendor=data.get("vendor", device.vendor),
            rtsp_stream_type=data.get("rtsp_stream_type", device.rtsp_stream_type),
            rtsp_mode=final_rtsp_mode,
            rtsp_url=requested_rtsp_url,
        )

    for field, value in data.items():
        setattr(device, field, value)
    await db.flush()
    await db.refresh(device)
    out = DeviceOut.model_validate(device)
    out.latest_ping_latency_ms = await latest_ping_latency(db, device.id)
    out.latest_ping_packet_loss_pct = device.ping_packet_loss_pct
    return out


@router.delete("/{device_id}", status_code=204)
async def delete_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.device_type == DeviceType.nvr and await has_linked_cameras(db, device.id):
        raise HTTPException(status_code=400, detail="Cannot delete an NVR while cameras are linked to it")
    device.is_active = False
    await db.flush()


@router.post("/{device_id}/trigger-check", response_model=dict)
async def trigger_manual_check(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    """Trigger an immediate health check for a device."""
    from app.workers.monitor import run_device_check
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await run_device_check(device_id)
    return {"message": "Check triggered", "device_id": device_id}
