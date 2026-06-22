from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Alert,
    AlertHistory,
    AlertSeverity,
    AlertState,
    AlertType,
    Device,
    DeviceType,
    FailureCounter,
    Site,
)
from app.core.config import settings
from app.services.notifications import DEFAULT_CHANNEL, send_notification

FAILURE_THRESHOLD = 3
ACTIVE_STATUSES = ("open", "acknowledged", "recovered")


ISSUE_LABELS = {
    AlertType.ping_failure: "Ping Failure",
    AlertType.rtsp_failure: "RTSP Stream Unavailable",
    AlertType.nvr_ping_failure: "NVR Ping Failure",
    AlertType.nvr_http_failure: "NVR HTTP/API Health Failure",
    AlertType.nvr_rtsp_failure: "NVR RTSP Stream Unavailable",
    AlertType.nvr_recording_failure: "NVR Recording Service Failure",
}


def alert_state_for_status(status: str) -> AlertState:
    if status == "acknowledged":
        return AlertState.acknowledged
    if status == "recovered":
        return AlertState.recovered
    if status == "resolved":
        return AlertState.resolved
    return AlertState.open


def check_key(alert_type: AlertType) -> str:
    return alert_type.value


def is_email(value: Optional[str]) -> bool:
    return bool(value and "@" in value and "." in value.split("@")[-1])


def configured_alert_emails() -> list[str]:
    return [
        email.strip()
        for email in (settings.ALERT_EMAIL_RECIPIENTS or "").split(",")
        if is_email(email.strip())
    ]


def alert_subject(*, site: Optional[Site], device: Device, issue: str, status: str) -> str:
    site_name = site.name if site else "Unknown Site"
    return f"CamWatch Alert - {issue} - {site_name} - {device.name} [{status.upper()}]"


async def get_or_create_counter(db: AsyncSession, device_id: str, check_type: str) -> FailureCounter:
    result = await db.execute(
        select(FailureCounter).where(
            FailureCounter.device_id == device_id,
            FailureCounter.check_type == check_type,
        )
    )
    counter = result.scalar_one_or_none()
    if counter:
        return counter
    counter = FailureCounter(device_id=device_id, check_type=check_type, consecutive_failures=0)
    db.add(counter)
    await db.flush()
    return counter


async def record_check_result(
    db: AsyncSession,
    *,
    device: Device,
    alert_type: AlertType,
    success: bool,
    severity: AlertSeverity,
    issue: Optional[str] = None,
) -> None:
    counter = await get_or_create_counter(db, device.id, check_key(alert_type))
    if success:
        counter.consecutive_failures = 0
        await mark_recovered(db, device_id=device.id, alert_type=alert_type)
        return

    counter.consecutive_failures = (counter.consecutive_failures or 0) + 1
    counter.last_failure_at = datetime.now(timezone.utc)
    if counter.consecutive_failures >= FAILURE_THRESHOLD:
        await create_or_update_alert(
            db,
            device=device,
            alert_type=alert_type,
            severity=severity,
            issue=issue or ISSUE_LABELS.get(alert_type, alert_type.value.replace("_", " ").title()),
        )


async def create_history(
    db: AsyncSession,
    *,
    alert: Alert,
    from_status: Optional[str],
    to_status: str,
    note: Optional[str] = None,
    actor_id: Optional[str] = None,
) -> None:
    db.add(AlertHistory(
        alert_id=alert.id,
        from_status=from_status,
        to_status=to_status,
        note=note,
        actor_id=actor_id,
    ))


async def affected_camera_names(db: AsyncSession, device: Device) -> list[str]:
    if device.device_type.value != "nvr":
        return []
    result = await db.execute(
        select(Device.name).where(
            Device.nvr_id == device.id,
            Device.device_type == DeviceType.camera,
            Device.is_active == True,
        )
    )
    return [name for name in result.scalars().all() if name]


async def build_alert_message(db: AsyncSession, *, alert: Alert, device: Device, site: Site, issue: str) -> str:
    lines = [
        "ALERT",
        "",
        f"Site: {site.name}",
        f"Area: {device.area or device.notes or '-'}",
        f"Device: {device.name}",
        f"Type: {'NVR' if device.device_type.value == 'nvr' else 'Camera'}",
        f"IP: {device.ip_address}",
        "",
        "Issue:",
        issue,
        "",
        "Started:",
        str(alert.created_at or datetime.now(timezone.utc)),
        "",
        "Status:",
        (alert.status or "open").upper(),
    ]
    affected = await affected_camera_names(db, device)
    if affected:
        lines.extend(["", "Affected Cameras:", ", ".join(affected)])
    return "\n".join(lines)


async def notify_site_contacts(
    db: AsyncSession,
    *,
    alert: Alert,
    site: Optional[Site],
    device: Optional[Device] = None,
    message: str,
    subject: Optional[str] = None,
    include_manager: bool = False,
) -> None:
    recipients = configured_alert_emails()
    if site:
        recipients.append(site.contact_email if is_email(site.contact_email) else None)
        recipients.append(site.regional_head_contact if is_email(site.regional_head_contact) else None)
    if site and include_manager:
        recipients.append(site.regional_manager_contact if is_email(site.regional_manager_contact) else None)
    recipients = [recipient for recipient in recipients if recipient]
    if not recipients:
        recipients.append(settings.FIRST_SUPERUSER_EMAIL)

    if include_manager:
        message = f"{message}\n\nEscalation: Regional manager notification included."

    seen = set()
    for recipient in recipients:
        if not recipient or recipient in seen:
            continue
        seen.add(recipient)
        await send_notification(
            db,
            channel=DEFAULT_CHANNEL,
            recipient=recipient,
            message=message,
            subject=subject or (alert_subject(
                site=site,
                device=device,
                issue=alert.description or alert.title,
                status=alert.status or "open",
            ) if device else "CamWatch Alert"),
            alert_id=alert.id,
        )


async def create_or_update_alert(
    db: AsyncSession,
    *,
    device: Device,
    alert_type: AlertType,
    severity: AlertSeverity,
    issue: str,
) -> Alert:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Alert).where(
            Alert.device_id == device.id,
            Alert.alert_type == alert_type,
            Alert.status.in_(ACTIVE_STATUSES),
        )
    )
    alert = result.scalar_one_or_none()
    if alert:
        previous = alert.status or "open"
        alert.last_seen_at = now
        alert.occurrence_count = (alert.occurrence_count or 1) + 1
        alert.description = issue
        alert.title = f"{device.name} - {issue}"
        alert.device_name = device.name
        alert.device_type = device.device_type.value
        alert.site_id = device.site_id

        if previous == "recovered":
            site = await db.get(Site, device.site_id)
            alert.status = "open"
            alert.state = AlertState.open
            alert.recovered_at = None
            alert.acknowledged_at = None
            alert.acknowledged_by = None
            alert.escalated_at = None
            alert.message = await build_alert_message(db, alert=alert, device=device, site=site, issue=issue)
            await create_history(
                db,
                alert=alert,
                from_status=previous,
                to_status="open",
                note="Failure returned after recovery",
            )
            await notify_site_contacts(
                db,
                alert=alert,
                site=site,
                device=device,
                message=alert.message,
                subject=alert_subject(site=site, device=device, issue=issue, status=alert.status or "open"),
            )
            return alert

        await create_history(
            db,
            alert=alert,
            from_status=previous,
            to_status=previous,
            note="Failure repeated",
        )
        return alert

    site = await db.get(Site, device.site_id)
    title = f"{device.name} - {issue}"
    alert = Alert(
        site_id=device.site_id,
        device_id=device.id,
        device_name=device.name,
        device_type=device.device_type.value,
        alert_type=alert_type,
        severity=severity,
        state=AlertState.open,
        status="open",
        title=title,
        description=issue,
        message=issue,
        last_seen_at=now,
        occurrence_count=1,
    )
    db.add(alert)
    await db.flush()
    alert.message = await build_alert_message(db, alert=alert, device=device, site=site, issue=issue)
    await create_history(db, alert=alert, from_status=None, to_status="open", note="Alert created")

    await notify_site_contacts(
        db,
        alert=alert,
        site=site,
        device=device,
        message=alert.message,
        subject=alert_subject(site=site, device=device, issue=issue, status=alert.status or "open"),
    )
    return alert


async def mark_recovered(db: AsyncSession, *, device_id: str, alert_type: AlertType) -> None:
    result = await db.execute(
        select(Alert, Device, Site)
        .join(Device, Alert.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(
            Alert.device_id == device_id,
            Alert.alert_type == alert_type,
            Alert.status.in_(("open", "acknowledged")),
        )
    )
    for alert, device, site in result.all():
        previous = alert.status or "open"
        alert.status = "recovered"
        alert.state = AlertState.recovered
        alert.recovered_at = datetime.now(timezone.utc)
        alert.message = await build_alert_message(
            db,
            alert=alert,
            device=device,
            site=site,
            issue=f"Recovered: {alert.description or alert.title}",
        )
        await create_history(
            db,
            alert=alert,
            from_status=previous,
            to_status="recovered",
            note="Monitoring check recovered",
        )
        await notify_site_contacts(
            db,
            alert=alert,
            site=site,
            device=device,
            message=alert.message,
            subject=alert_subject(
                site=site,
                device=device,
                issue=f"Recovered: {alert.description or alert.title}",
                status=alert.status or "recovered",
            ),
            include_manager=bool(alert.escalated_at),
        )


async def acknowledge_alert(db: AsyncSession, *, alert: Alert, actor_id: str) -> Alert:
    previous = alert.status or "open"
    alert.status = "acknowledged"
    alert.state = AlertState.acknowledged
    alert.acknowledged_at = datetime.now(timezone.utc)
    alert.acknowledged_by = actor_id
    await create_history(db, alert=alert, from_status=previous, to_status="acknowledged", actor_id=actor_id)
    return alert


async def recover_alert(db: AsyncSession, *, alert: Alert, actor_id: str) -> Alert:
    if alert.status == "resolved":
        raise ValueError("Resolved alerts cannot be recovered")
    previous = alert.status or "open"
    alert.status = "recovered"
    alert.state = AlertState.recovered
    alert.recovered_at = datetime.now(timezone.utc)
    await create_history(
        db,
        alert=alert,
        from_status=previous,
        to_status="recovered",
        note="Manually marked recovered",
        actor_id=actor_id,
    )
    result = await db.execute(
        select(Device, Site)
        .join(Site, Device.site_id == Site.id)
        .where(Device.id == alert.device_id)
    )
    row = result.first()
    if row:
        device, site = row
        alert.message = await build_alert_message(
            db,
            alert=alert,
            device=device,
            site=site,
            issue=f"Recovered: {alert.description or alert.title}",
        )
        await notify_site_contacts(
            db,
            alert=alert,
            site=site,
            device=device,
            message=alert.message,
            subject=alert_subject(
                site=site,
                device=device,
                issue=f"Recovered: {alert.description or alert.title}",
                status=alert.status or "recovered",
            ),
            include_manager=bool(alert.escalated_at),
        )
    return alert


async def resolve_alert(db: AsyncSession, *, alert: Alert, actor_id: str, force: bool = False) -> Alert:
    if alert.status != "recovered" and not force:
        raise ValueError("Alert must be recovered before it can be resolved")
    previous = alert.status or "open"
    alert.status = "resolved"
    alert.state = AlertState.resolved
    alert.resolved_at = datetime.now(timezone.utc)
    alert.resolved_by = actor_id
    await create_history(db, alert=alert, from_status=previous, to_status="resolved", actor_id=actor_id)
    result = await db.execute(
        select(Device, Site)
        .join(Site, Device.site_id == Site.id)
        .where(Device.id == alert.device_id)
    )
    row = result.first()
    if row:
        device, site = row
        alert.message = await build_alert_message(
            db,
            alert=alert,
            device=device,
            site=site,
            issue=f"Resolved by user: {alert.description or alert.title}",
        )
        await notify_site_contacts(
            db,
            alert=alert,
            site=site,
            device=device,
            message=alert.message,
            subject=alert_subject(
                site=site,
                device=device,
                issue=f"Resolved: {alert.description or alert.title}",
                status=alert.status or "resolved",
            ),
            include_manager=bool(alert.escalated_at),
        )
    return alert


async def escalate_stale_alerts(db: AsyncSession) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    result = await db.execute(
        select(Alert, Device, Site)
        .join(Device, Alert.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(
            Alert.status == "open",
            Alert.acknowledged_at.is_(None),
            Alert.escalated_at.is_(None),
            Alert.created_at <= cutoff,
            Device.is_active == True,
            Site.is_active == True,
        )
    )
    count = 0
    for alert, device, site in result.all():
        message = await build_alert_message(
            db,
            alert=alert,
            device=device,
            site=site,
            issue=alert.description or alert.title,
        )
        message = f"{message}\n\nAlert Age:\n30 minutes\n\nRegional Head or Regional Manager can acknowledge."
        await notify_site_contacts(
            db,
            alert=alert,
            site=site,
            device=device,
            message=message,
            subject=alert_subject(
                site=site,
                device=device,
                issue=f"Escalated: {alert.description or alert.title}",
                status=alert.status or "open",
            ),
            include_manager=True,
        )
        alert.escalated_at = datetime.now(timezone.utc)
        await create_history(db, alert=alert, from_status="open", to_status="open", note="Escalated to regional manager")
        count += 1
    return count
