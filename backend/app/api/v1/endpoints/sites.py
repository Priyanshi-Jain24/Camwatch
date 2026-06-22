from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from typing import List, Optional

from app.db.session import get_db
from app.models import Alert, AlertState, Site, Device, DeviceStatus
from app.schemas import SiteCreate, SiteUpdate, SiteOut
from app.api.deps import get_current_admin, get_current_user

router = APIRouter()


@router.get("/", response_model=List[SiteOut])
async def list_sites(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Fetch sites + counts in two queries (sites paged, then one GROUP BY for counts)
    result = await db.execute(select(Site).where(Site.is_active == True).offset(skip).limit(limit))
    sites = result.scalars().all()
    site_ids = [s.id for s in sites]

    counts_result = await db.execute(
        select(
            Device.site_id,
            func.count(Device.id).label("total"),
            func.sum(case((Device.status == DeviceStatus.online, 1), else_=0)).label("online"),
            func.sum(case((Device.status == DeviceStatus.degraded, 1), else_=0)).label("degraded"),
            func.sum(case((Device.status == DeviceStatus.offline, 1), else_=0)).label("offline"),
        )
        .where(Device.site_id.in_(site_ids), Device.is_active == True)
        .group_by(Device.site_id)
    )
    counts_by_site = {row.site_id: row for row in counts_result.all()}

    out = []
    for site in sites:
        row = counts_by_site.get(site.id)
        s = SiteOut.model_validate(site)
        s.total_devices = int(row.total) if row else 0
        s.online_devices = int(row.online or 0) if row else 0
        s.degraded_devices = int(row.degraded or 0) if row else 0
        s.offline_devices = int(row.offline or 0) if row else 0
        out.append(s)
    return out


@router.post("/", response_model=SiteOut, status_code=201)
async def create_site(
    site_in: SiteCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    site = Site(**site_in.model_dump())
    db.add(site)
    await db.flush()
    await db.refresh(site)
    return SiteOut.model_validate(site)


@router.get("/{site_id}", response_model=SiteOut)
async def get_site(
    site_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Site).where(Site.id == site_id, Site.is_active == True))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return SiteOut.model_validate(site)


@router.put("/{site_id}", response_model=SiteOut)
async def update_site(
    site_id: str,
    site_in: SiteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(Site).where(Site.id == site_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    for field, value in site_in.model_dump(exclude_unset=True).items():
        setattr(site, field, value)
    await db.flush()
    await db.refresh(site)
    return SiteOut.model_validate(site)


@router.delete("/{site_id}", status_code=204)
async def delete_site(
    site_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    result = await db.execute(select(Site).where(Site.id == site_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    site.is_active = False

    devices_result = await db.execute(select(Device).where(Device.site_id == site_id))
    devices = devices_result.scalars().all()
    device_ids = [device.id for device in devices]
    for device in devices:
        device.is_active = False

    if device_ids:
        alerts_result = await db.execute(
            select(Alert).where(
                Alert.device_id.in_(device_ids),
                Alert.status.in_(["open", "acknowledged", "recovered"]),
            )
        )
        for alert in alerts_result.scalars().all():
            alert.status = "resolved"
            alert.state = AlertState.resolved
            alert.resolved_at = datetime.now(timezone.utc)

    await db.flush()
