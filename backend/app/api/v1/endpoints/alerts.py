from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_user
from app.db.session import get_db
from app.models import Alert, AlertHistory, AlertSeverity, AlertType, Device, DeviceType, NotificationLog, Site
from app.schemas import AlertHistoryResponse, AlertOut
from app.services.alerts import acknowledge_alert as acknowledge_alert_service
from app.services.alerts import recover_alert as recover_alert_service
from app.services.alerts import resolve_alert as resolve_alert_service

router = APIRouter()


def to_alert_out(alert: Alert, device_name: Optional[str] = None, site_name: Optional[str] = None) -> AlertOut:
    out = AlertOut.model_validate(alert)
    out.device_name = alert.device_name or device_name
    out.site_name = site_name
    out.status = alert.status or alert.state.value
    return out


@router.get("/", response_model=List[AlertOut])
async def list_alerts(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status: Optional[str] = None,
    state: Optional[str] = None,
    include_resolved: bool = False,
    severity: Optional[AlertSeverity] = None,
    alert_type: Optional[AlertType] = None,
    device_type: Optional[DeviceType] = None,
    site_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = (
        select(Alert, Device.name.label("device_name"), Site.name.label("site_name"))
        .join(Device, Alert.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(Device.is_active == True, Site.is_active == True)
    )
    effective_status = status or state
    if effective_status:
        q = q.where(Alert.status == effective_status)
    elif not include_resolved:
        q = q.where(Alert.status != "resolved")
    if severity:
        q = q.where(Alert.severity == severity)
    if alert_type:
        q = q.where(Alert.alert_type == alert_type)
    if device_type:
        q = q.where(Device.device_type == device_type)
    if site_id:
        q = q.where(Device.site_id == site_id)

    q = q.order_by(Alert.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    return [to_alert_out(alert, device_name, site_name) for alert, device_name, site_name in result.all()]


@router.get("/summary", response_model=dict)
async def alert_summary(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(Alert.severity, Alert.status, func.count().label("cnt"))
        .join(Device, Alert.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(Device.is_active == True, Site.is_active == True)
        .group_by(Alert.severity, Alert.status)
    )
    data = {"open": 0, "acknowledged": 0, "recovered": 0, "critical_open": 0}
    for severity, status, cnt in result.all():
        status = status or "open"
        if status in data:
            data[status] += cnt
        if status == "open" and severity in (AlertSeverity.critical, AlertSeverity.high):
            data["critical_open"] += cnt
    return data


@router.post("/{alert_id}/acknowledge", response_model=AlertOut)
async def acknowledge_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.status == "resolved":
        raise HTTPException(status_code=400, detail="Resolved alerts cannot be acknowledged")
    await acknowledge_alert_service(db, alert=alert, actor_id=current_user.id)
    await db.flush()
    return to_alert_out(alert)


@router.post("/{alert_id}/resolve", response_model=AlertOut)
async def resolve_alert(
    alert_id: str,
    force: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    try:
        await resolve_alert_service(db, alert=alert, actor_id=current_user.id, force=force)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await db.flush()
    return to_alert_out(alert)


@router.post("/{alert_id}/recover", response_model=AlertOut)
async def recover_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_admin),
):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    try:
        await recover_alert_service(db, alert=alert, actor_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await db.flush()
    return to_alert_out(alert)


@router.get("/{alert_id}/history", response_model=AlertHistoryResponse)
async def alert_history(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(Alert, Device.name.label("device_name"), Site.name.label("site_name"))
        .join(Device, Alert.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(Alert.id == alert_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert, device_name, site_name = row
    history_result = await db.execute(
        select(AlertHistory)
        .where(AlertHistory.alert_id == alert_id)
        .order_by(AlertHistory.created_at.desc())
    )
    notification_result = await db.execute(
        select(NotificationLog)
        .where(NotificationLog.alert_id == alert_id)
        .order_by(NotificationLog.sent_at.desc())
    )
    return AlertHistoryResponse(
        alert=to_alert_out(alert, device_name, site_name),
        history=list(history_result.scalars().all()),
        notifications=list(notification_result.scalars().all()),
    )
