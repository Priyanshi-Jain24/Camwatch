from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import aliased
from typing import List, Optional

from app.db.session import get_db
from app.models import Device, Site, DeviceType, DeviceStatus, CheckLog, CheckType, Alert, RtspMode, AlertHistory
from app.schemas import (
    DeviceCreate, DeviceUpdate, DeviceOut, DeviceDetail, CheckLogOut, AlertOut,
    DeviceHealthHistoryResponse, DeviceHealthCheckOut, DeviceHealthTimelineBucketOut,
    DeviceHealthTimelineCheckOut, DeviceHealthEventOut,
)
from app.api.deps import get_current_admin, get_current_user
from app.services.device_urls import build_rtsp_url, normalize_vendor
from app.workers.monitor import resolve_device_status

router = APIRouter()

UTC = timezone.utc

CHECK_LABELS = {
    CheckType.ping: "Ping",
    CheckType.rtsp: "RTSP",
    CheckType.api: "API",
    CheckType.recording: "Recording",
}

TIMELINE_PRIORITY = {
    "offline": 3,
    "degraded": 2,
    "online": 1,
    "no_data": 0,
}


def utc_now() -> datetime:
    return datetime.now(UTC)


def as_aware_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def timeline_check_status(check_type: CheckType, success: Optional[bool], error_message: Optional[str], packet_loss_pct: Optional[float] = None) -> str:
    if success is None:
        return "no_data"
    if check_type == CheckType.ping and success and packet_loss_pct is not None and packet_loss_pct > 0:
        return "warning"
    if check_type == CheckType.recording and not success and error_message and any(token in error_message.lower() for token in ("delay", "delayed", "lag")):
        return "warning"
    return "healthy" if success else "failed"


def summarize_check_detail(
    *,
    check_type: CheckType,
    success: Optional[bool],
    error_message: Optional[str],
    latency_ms: Optional[float] = None,
    packet_loss_pct: Optional[float] = None,
) -> str:
    if success is None:
        return "No data"
    if check_type == CheckType.ping:
        if success:
            parts: list[str] = []
            if latency_ms is not None:
                parts.append(f"{round(latency_ms)} ms")
            if packet_loss_pct is not None and packet_loss_pct > 0:
                parts.append(f"{round(packet_loss_pct)}% loss")
            return " | ".join(parts) if parts else "Reachable"
        return error_message or "Ping failed"
    if check_type == CheckType.api:
        return "200 OK" if success else (error_message or "API failed")
    if check_type == CheckType.rtsp:
        return "Stream responding" if success else (error_message or "RTSP failed")
    if check_type == CheckType.recording:
        return "Recording healthy" if success else (error_message or "Recording failed")
    return error_message or ("Pass" if success else "Fail")


def summarize_current_reason(check_type: CheckType, success: Optional[bool], error_message: Optional[str], latency_ms: Optional[float] = None, packet_loss_pct: Optional[float] = None) -> tuple[str, Optional[str]]:
    if success is None:
        return "No recent check data", None
    if check_type == CheckType.ping:
        metrics = f"{round(latency_ms)} ms" if latency_ms is not None else None
        if success and packet_loss_pct is not None and packet_loss_pct > 0:
            return "Partial packet loss", metrics
        return ("Pass", metrics) if success else (error_message or "Ping failed", None)
    if check_type == CheckType.api:
        return ("Pass", "200 OK") if success else (error_message or "API check failed", None)
    if check_type == CheckType.rtsp:
        return ("Pass", None) if success else (error_message or "RTSP failed", None)
    if check_type == CheckType.recording:
        if success:
            return "Pass", None
        if error_message and any(token in error_message.lower() for token in ("delay", "delayed", "lag")):
            return error_message, None
        return error_message or "Recording failed", None
    return ("Pass", None) if success else (error_message or "Failed", None)


def overall_reason_from_checks(device_type: DeviceType, checks_state: dict[CheckType, dict]) -> str:
    failing: list[str] = []
    warnings: list[str] = []

    ping = checks_state.get(CheckType.ping)
    if ping:
        if ping.get("success") is False:
            failing.append("Ping failed")
        elif ping.get("packet_loss_pct") is not None and ping.get("packet_loss_pct", 0) > 0:
            warnings.append("Ping warning")

    for check_type in (CheckType.rtsp, CheckType.api, CheckType.recording):
        if device_type == DeviceType.camera and check_type != CheckType.rtsp:
            continue
        state = checks_state.get(check_type)
        if not state or state.get("success") is None:
            continue
        if state.get("success") is False:
            label = CHECK_LABELS[check_type]
            detail = state.get("error_message")
            failing.append(f"{label} failed{f' ({detail})' if detail else ''}")
        elif check_type == CheckType.recording and state.get("error_message") and any(token in state["error_message"].lower() for token in ("delay", "delayed", "lag")):
            warnings.append(state["error_message"])

    if failing:
        return " | ".join(failing[:3])
    if warnings:
        return " | ".join(warnings[:3])
    return "All checks healthy"


def device_status_from_checks(device_type: DeviceType, checks_state: dict[CheckType, dict]) -> str:
    ping_state = checks_state.get(CheckType.ping)
    ping_ok = ping_state.get("success") if ping_state else None
    if ping_ok is None and not checks_state:
        return "no_data"

    service_checks: list[Optional[bool]] = []
    if device_type == DeviceType.camera:
        service_checks = [checks_state.get(CheckType.rtsp, {}).get("success")]
    else:
        service_checks = [
            checks_state.get(CheckType.api, {}).get("success"),
            checks_state.get(CheckType.rtsp, {}).get("success"),
            checks_state.get(CheckType.recording, {}).get("success"),
        ]
    has_warning = bool(
        ping_state
        and ping_state.get("success")
        and ping_state.get("packet_loss_pct") is not None
        and 0 < ping_state.get("packet_loss_pct", 0) < 100
    )
    resolved = resolve_device_status(
        ping_ok=ping_ok,
        service_checks=service_checks,
        has_warning=has_warning,
    )
    return resolved.value if isinstance(resolved, DeviceStatus) else str(resolved)


def event_severity_for_status(status: str) -> str:
    if status == "offline":
        return "critical"
    if status == "degraded":
        return "high"
    return "low"


def event_severity_for_check(check_type: CheckType, success: bool, error_message: Optional[str]) -> str:
    if success:
        return "low"
    if check_type in (CheckType.api, CheckType.rtsp, CheckType.recording):
        if error_message and any(token in error_message.lower() for token in ("delay", "delayed", "lag")):
            return "medium"
        return "high"
    return "medium"


def minute_floor(value: datetime) -> datetime:
    aware = as_aware_utc(value) or utc_now()
    return aware.replace(second=0, microsecond=0)


def hour_floor(value: datetime) -> datetime:
    aware = as_aware_utc(value) or utc_now()
    return aware.replace(minute=0, second=0, microsecond=0)


def bucket_status_from_counts(counts: dict[str, int]) -> str:
    candidates = ["online", "degraded", "offline", "no_data"]
    return max(candidates, key=lambda status: (counts.get(status, 0), TIMELINE_PRIORITY[status]))


def build_current_health_checks(device_type: DeviceType, latest_logs: dict[CheckType, CheckLog]) -> list[DeviceHealthCheckOut]:
    checks: list[DeviceHealthCheckOut] = []
    ordered_types = [CheckType.ping, CheckType.rtsp]
    if device_type == DeviceType.nvr:
        ordered_types.extend([CheckType.api, CheckType.recording])

    for check_type in ordered_types:
        latest = latest_logs.get(check_type)
        success = latest.success if latest else None
        reason, metrics = summarize_current_reason(
            check_type,
            success,
            latest.error_message if latest else None,
            latest.latency_ms if latest else None,
            latest.packet_loss_pct if latest else None,
        )
        checks.append(DeviceHealthCheckOut(
            key=check_type.value,
            label=CHECK_LABELS[check_type],
            status=timeline_check_status(
                check_type,
                success,
                latest.error_message if latest else None,
                latest.packet_loss_pct if latest else None,
            ),
            reason=reason,
            metrics=metrics,
            observed_at=as_aware_utc(latest.checked_at) if latest else None,
        ))
    return checks


def normalize_history_status(status: Optional[str]) -> str:
    value = (status or "").strip().lower()
    if value == "resolved":
        return "online"
    if value == "recovered":
        return "degraded"
    if value in {"open", "acknowledged"}:
        return "offline"
    return value or "unknown"


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


@router.get("/{device_id}/health-history", response_model=DeviceHealthHistoryResponse)
async def get_device_health_history(
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

    device, _site_name = row
    now = utc_now()
    end_at = hour_floor(now) + timedelta(hours=1)
    start_at = end_at - timedelta(hours=24)

    recent_logs_result = await db.execute(
        select(CheckLog)
        .where(
            CheckLog.device_id == device_id,
            CheckLog.checked_at >= start_at - timedelta(hours=2),
            CheckLog.checked_at < end_at,
        )
        .order_by(CheckLog.checked_at.asc())
    )
    all_logs = list(recent_logs_result.scalars().all())

    latest_logs: dict[CheckType, CheckLog] = {}
    for check_type in (CheckType.ping, CheckType.rtsp, CheckType.api, CheckType.recording):
        latest_result = await db.execute(
            select(CheckLog)
            .where(CheckLog.device_id == device_id, CheckLog.check_type == check_type)
            .order_by(CheckLog.checked_at.desc())
            .limit(1)
        )
        latest = latest_result.scalar_one_or_none()
        if latest:
            latest_logs[check_type] = latest

    current_checks = build_current_health_checks(device.device_type, latest_logs)

    seed_logs: dict[CheckType, CheckLog] = {}
    for check_type in (CheckType.ping, CheckType.rtsp, CheckType.api, CheckType.recording):
        seed_result = await db.execute(
            select(CheckLog)
            .where(
                CheckLog.device_id == device_id,
                CheckLog.check_type == check_type,
                CheckLog.checked_at < start_at,
            )
            .order_by(CheckLog.checked_at.desc())
            .limit(1)
        )
        seed = seed_result.scalar_one_or_none()
        if seed:
            seed_logs[check_type] = seed

    checks_state: dict[CheckType, dict] = {}
    for check_type, seed in seed_logs.items():
        checks_state[check_type] = {
            "success": seed.success,
            "error_message": seed.error_message,
            "latency_ms": seed.latency_ms,
            "packet_loss_pct": seed.packet_loss_pct,
            "checked_at": as_aware_utc(seed.checked_at),
        }

    status_samples: list[dict] = []
    check_events: list[DeviceHealthEventOut] = []
    previous_check_result: dict[CheckType, Optional[bool]] = {
        check_type: seed.success for check_type, seed in seed_logs.items()
    }

    for log in all_logs:
        checked_at = as_aware_utc(log.checked_at)
        if checked_at is None:
            continue
        checks_state[log.check_type] = {
            "success": log.success,
            "error_message": log.error_message,
            "latency_ms": log.latency_ms,
            "packet_loss_pct": log.packet_loss_pct,
            "checked_at": checked_at,
        }

        if checked_at >= start_at:
            previous = previous_check_result.get(log.check_type)
            label = CHECK_LABELS[log.check_type]
            if log.success:
                if previous is False:
                    check_events.append(DeviceHealthEventOut(
                        timestamp=checked_at,
                        severity="low",
                        title=f"{label} Recovered",
                        reason=summarize_check_detail(
                            check_type=log.check_type,
                            success=True,
                            error_message=log.error_message,
                            latency_ms=log.latency_ms,
                            packet_loss_pct=log.packet_loss_pct,
                        ),
                        status="online",
                    ))
            else:
                check_status = timeline_check_status(log.check_type, False, log.error_message, log.packet_loss_pct)
                check_events.append(DeviceHealthEventOut(
                    timestamp=checked_at,
                    severity=event_severity_for_check(log.check_type, False, log.error_message),
                    title=f"{label} {'Delayed' if check_status == 'warning' else 'Failed'}",
                    reason=summarize_check_detail(
                        check_type=log.check_type,
                        success=False,
                        error_message=log.error_message,
                        latency_ms=log.latency_ms,
                        packet_loss_pct=log.packet_loss_pct,
                    ),
                    status="degraded" if check_status == "warning" else "offline",
                ))
            previous_check_result[log.check_type] = log.success

        if log.check_type == CheckType.ping and checked_at >= start_at:
            overall_status = device_status_from_checks(device.device_type, checks_state)
            if overall_status == "unknown":
                overall_status = "no_data"
            check_summaries: list[DeviceHealthTimelineCheckOut] = []
            for check_type in [CheckType.ping, CheckType.rtsp, CheckType.api, CheckType.recording]:
                if device.device_type == DeviceType.camera and check_type not in (CheckType.ping, CheckType.rtsp):
                    continue
                if device.device_type == DeviceType.nvr or check_type in (CheckType.ping, CheckType.rtsp):
                    state = checks_state.get(check_type)
                    check_summaries.append(DeviceHealthTimelineCheckOut(
                        label=CHECK_LABELS[check_type],
                        status=timeline_check_status(
                            check_type,
                            state.get("success") if state else None,
                            state.get("error_message") if state else None,
                            state.get("packet_loss_pct") if state else None,
                        ),
                        detail=summarize_check_detail(
                            check_type=check_type,
                            success=state.get("success") if state else None,
                            error_message=state.get("error_message") if state else None,
                            latency_ms=state.get("latency_ms") if state else None,
                            packet_loss_pct=state.get("packet_loss_pct") if state else None,
                        ),
                    ))
            status_samples.append({
                "timestamp": checked_at,
                "status": overall_status,
                "reason": overall_reason_from_checks(device.device_type, checks_state),
                "checks": check_summaries,
            })

    minute_samples: dict[datetime, dict] = {}
    for sample in status_samples:
        minute_samples[minute_floor(sample["timestamp"])] = sample

    timeline: list[DeviceHealthTimelineBucketOut] = []
    online_minutes = degraded_minutes = offline_minutes = no_data_minutes = 0
    status_events: list[DeviceHealthEventOut] = []

    previous_status: Optional[str] = None
    for minute in sorted(minute_samples.keys()):
        sample = minute_samples[minute]
        status = sample["status"]
        if previous_status is not None and previous_status != status:
            status_events.append(DeviceHealthEventOut(
                timestamp=sample["timestamp"],
                severity=event_severity_for_status(status),
                title=f"Device status changed to {status.capitalize()}",
                reason=sample["reason"],
                status=status,
            ))
        previous_status = status

    for index in range(24):
        bucket_start = start_at + timedelta(hours=index)
        bucket_end = bucket_start + timedelta(hours=1)
        counts = {"online": 0, "degraded": 0, "offline": 0, "no_data": 0}
        bucket_samples = [
            sample
            for minute, sample in minute_samples.items()
            if bucket_start <= minute < bucket_end
        ]
        for minute_offset in range(60):
            minute_key = bucket_start + timedelta(minutes=minute_offset)
            sample = minute_samples.get(minute_key)
            if sample:
                counts[sample["status"]] = counts.get(sample["status"], 0) + 1
            else:
                counts["no_data"] += 1

        online_minutes += counts["online"]
        degraded_minutes += counts["degraded"]
        offline_minutes += counts["offline"]
        no_data_minutes += counts["no_data"]

        bucket_status = bucket_status_from_counts(counts)
        latest_sample = bucket_samples[-1] if bucket_samples else None
        timeline.append(DeviceHealthTimelineBucketOut(
            start_at=bucket_start,
            end_at=bucket_end,
            status=bucket_status,
            reason=latest_sample["reason"] if latest_sample else "No monitoring data",
            checks=latest_sample["checks"] if latest_sample else [],
        ))

    alert_history_result = await db.execute(
        select(AlertHistory, Alert)
        .join(Alert, AlertHistory.alert_id == Alert.id)
        .where(
            Alert.device_id == device_id,
            AlertHistory.created_at >= start_at,
        )
        .order_by(AlertHistory.created_at.desc())
        .limit(40)
    )
    alert_events = [
        DeviceHealthEventOut(
            timestamp=as_aware_utc(history.created_at) or now,
            severity=event_severity_for_status(normalize_history_status(history.to_status)),
            title=f"Alert workflow: {(history.to_status or 'updated').replace('_', ' ').title()}",
            reason=history.note or alert.description or alert.title,
            status=normalize_history_status(history.to_status),
        )
        for history, alert in alert_history_result.all()
    ]

    events = sorted(
        [*check_events, *status_events, *alert_events],
        key=lambda event: event.timestamp,
        reverse=True,
    )[:50]

    uptime_24h_percent = round(((online_minutes + degraded_minutes) / 1440) * 100, 1)

    return DeviceHealthHistoryResponse(
        device_id=device.id,
        current_status=device.status.value if isinstance(device.status, DeviceStatus) else str(device.status),
        last_seen=as_aware_utc(device.last_seen),
        latency_ms=latest_logs.get(CheckType.ping).latency_ms if latest_logs.get(CheckType.ping) else None,
        uptime_24h_percent=uptime_24h_percent,
        online_minutes=online_minutes,
        degraded_minutes=degraded_minutes,
        offline_minutes=offline_minutes,
        no_data_minutes=no_data_minutes,
        current_checks=current_checks,
        timeline=timeline,
        events=events,
    )


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
