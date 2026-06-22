from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models import CheckLog, CheckType, Device, DeviceType, Site
from app.schemas import SiteUptimeReport, SiteUptimeReportRow, UptimeReport, UptimeReportRow

router = APIRouter()


def report_window(period: Literal["daily", "weekly", "monthly"]) -> tuple[datetime, datetime]:
    now = datetime.utcnow()
    if period == "daily":
        start = now - timedelta(days=1)
    elif period == "weekly":
        start = now - timedelta(days=7)
    else:
        start = now - timedelta(days=30)
    return start, now


@router.get("/uptime", response_model=UptimeReport)
async def uptime_report(
    period: Literal["daily", "weekly", "monthly"] = Query("daily"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    start, now = report_window(period)

    q = (
        select(
            Device,
            Site.name.label("site_name"),
            func.count(CheckLog.id).label("total_checks"),
            func.sum(case((CheckLog.success == True, 1), else_=0)).label("successful_checks"),
        )
        .join(Site, Device.site_id == Site.id)
        .outerjoin(
            CheckLog,
            (CheckLog.device_id == Device.id)
            & (CheckLog.checked_at >= start)
            & (CheckLog.checked_at <= now)
            & (CheckLog.check_type == CheckType.ping),
        )
        .where(Device.is_active == True, Site.is_active == True)
        .group_by(Device.id, Site.name)
    )
    result = await db.execute(q)

    rows = []
    for device, site_name, total_checks, successful_checks in result.all():
        total = int(total_checks or 0)
        success = int(successful_checks or 0)
        uptime_pct = round((success / total * 100) if total > 0 else 0, 2)
        downtime_secs = (total - success) * settings.PING_INTERVAL_SECONDS

        rows.append(UptimeReportRow(
            device_id=device.id,
            device_name=device.name,
            site_name=site_name,
            device_type=device.device_type.value,
            uptime_percent=uptime_pct,
            downtime_seconds=downtime_secs,
            total_checks=total,
            successful_checks=success,
        ))

    rows.sort(key=lambda row: row.uptime_percent)
    return UptimeReport(period=period, start_date=start, end_date=now, rows=rows)


@router.get("/uptime/sites", response_model=SiteUptimeReport)
async def site_uptime_report(
    period: Literal["daily", "weekly", "monthly"] = Query("daily"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    start, now = report_window(period)

    q = (
        select(
            Site.id.label("site_id"),
            Site.name.label("site_name"),
            func.count(func.distinct(Device.id)).label("total_devices"),
            func.count(func.distinct(case((Device.device_type == DeviceType.camera, Device.id)))).label("camera_count"),
            func.count(func.distinct(case((Device.device_type == DeviceType.nvr, Device.id)))).label("nvr_count"),
            func.count(CheckLog.id).label("total_checks"),
            func.sum(case((CheckLog.success == True, 1), else_=0)).label("successful_checks"),
        )
        .join(Device, Device.site_id == Site.id)
        .outerjoin(
            CheckLog,
            (CheckLog.device_id == Device.id)
            & (CheckLog.checked_at >= start)
            & (CheckLog.checked_at <= now)
            & (CheckLog.check_type == CheckType.ping),
        )
        .where(Site.is_active == True, Device.is_active == True)
        .group_by(Site.id, Site.name)
    )
    result = await db.execute(q)

    rows = []
    for site_id, site_name, total_devices, camera_count, nvr_count, total_checks, successful_checks in result.all():
        total = int(total_checks or 0)
        success = int(successful_checks or 0)
        uptime_pct = round((success / total * 100) if total > 0 else 0, 2)
        downtime_secs = (total - success) * settings.PING_INTERVAL_SECONDS

        rows.append(SiteUptimeReportRow(
            site_id=site_id,
            site_name=site_name,
            total_devices=int(total_devices or 0),
            camera_count=int(camera_count or 0),
            nvr_count=int(nvr_count or 0),
            uptime_percent=uptime_pct,
            downtime_seconds=downtime_secs,
            total_checks=total,
            successful_checks=success,
        ))

    rows.sort(key=lambda row: row.uptime_percent)
    return SiteUptimeReport(period=period, start_date=start, end_date=now, rows=rows)
