from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case

from app.db.session import get_db
from app.models import Device, Site, Alert, DeviceType, DeviceStatus, AlertSeverity
from app.schemas import DashboardData, DashboardStats, SiteStatus, AlertOut, DeviceOut
from app.api.deps import get_current_user

router = APIRouter()


@router.get("/", response_model=DashboardData)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Camera counts
    cam_total = await db.execute(
        select(func.count())
        .select_from(Device)
        .join(Site, Device.site_id == Site.id)
        .where(Device.device_type == DeviceType.camera, Device.is_active == True, Site.is_active == True)
    )
    cam_online = await db.execute(
        select(func.count())
        .select_from(Device)
        .join(Site, Device.site_id == Site.id)
        .where(
            Device.device_type == DeviceType.camera,
            Device.is_active == True,
            Site.is_active == True,
            Device.status == DeviceStatus.online,
        )
    )
    cam_offline = await db.execute(
        select(func.count())
        .select_from(Device)
        .join(Site, Device.site_id == Site.id)
        .where(
            Device.device_type == DeviceType.camera,
            Device.is_active == True,
            Site.is_active == True,
            Device.status == DeviceStatus.offline,
        )
    )
    cam_degraded = await db.execute(
        select(func.count())
        .select_from(Device)
        .join(Site, Device.site_id == Site.id)
        .where(
            Device.device_type == DeviceType.camera,
            Device.is_active == True,
            Site.is_active == True,
            Device.status == DeviceStatus.degraded,
        )
    )
    standalone_cameras = await db.execute(
        select(func.count())
        .select_from(Device)
        .join(Site, Device.site_id == Site.id)
        .where(
            Device.device_type == DeviceType.camera,
            Device.is_active == True,
            Site.is_active == True,
            Device.nvr_id.is_(None),
        )
    )
    nvr_linked_cameras = await db.execute(
        select(func.count())
        .select_from(Device)
        .join(Site, Device.site_id == Site.id)
        .where(
            Device.device_type == DeviceType.camera,
            Device.is_active == True,
            Site.is_active == True,
            Device.nvr_id.is_not(None),
        )
    )

    # NVR counts
    nvr_total = await db.execute(
        select(func.count())
        .select_from(Device)
        .join(Site, Device.site_id == Site.id)
        .where(Device.device_type == DeviceType.nvr, Device.is_active == True, Site.is_active == True)
    )
    nvr_online = await db.execute(
        select(func.count())
        .select_from(Device)
        .join(Site, Device.site_id == Site.id)
        .where(
            Device.device_type == DeviceType.nvr,
            Device.is_active == True,
            Site.is_active == True,
            Device.status == DeviceStatus.online,
        )
    )
    nvr_offline = await db.execute(
        select(func.count())
        .select_from(Device)
        .join(Site, Device.site_id == Site.id)
        .where(
            Device.device_type == DeviceType.nvr,
            Device.is_active == True,
            Site.is_active == True,
            Device.status == DeviceStatus.offline,
        )
    )
    nvr_degraded = await db.execute(
        select(func.count())
        .select_from(Device)
        .join(Site, Device.site_id == Site.id)
        .where(
            Device.device_type == DeviceType.nvr,
            Device.is_active == True,
            Site.is_active == True,
            Device.status == DeviceStatus.degraded,
        )
    )

    # Sites
    sites_total = await db.execute(select(func.count()).where(Site.is_active == True))

    # Alerts
    active_alerts = await db.execute(
        select(func.count())
        .select_from(Alert)
        .join(Device, Alert.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(
            Alert.status.in_(["open", "acknowledged", "recovered"]),
            Device.is_active == True,
            Site.is_active == True,
        )
    )
    critical_alerts_count = await db.execute(
        select(func.count())
        .select_from(Alert)
        .join(Device, Alert.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(
            Alert.status == "open",
            Alert.severity.in_([AlertSeverity.critical, AlertSeverity.high]),
            Device.is_active == True,
            Site.is_active == True,
        )
    )

    nvr_online_count = nvr_online.scalar() or 0
    nvr_offline_count = nvr_offline.scalar() or 0

    stats = DashboardStats(
        total_cameras=cam_total.scalar() or 0,
        online_cameras=cam_online.scalar() or 0,
        degraded_cameras=cam_degraded.scalar() or 0,
        offline_cameras=cam_offline.scalar() or 0,
        standalone_cameras=standalone_cameras.scalar() or 0,
        nvr_linked_cameras=nvr_linked_cameras.scalar() or 0,
        total_nvrs=nvr_total.scalar() or 0,
        online_nvrs=nvr_online_count,
        degraded_nvrs=nvr_degraded.scalar() or 0,
        offline_nvrs=nvr_offline_count,
        healthy_nvrs=nvr_online_count,
        failed_nvrs=nvr_offline_count,
        total_sites=sites_total.scalar() or 0,
        active_alerts=active_alerts.scalar() or 0,
        critical_alerts=critical_alerts_count.scalar() or 0,
    )

    # Per-site status — single GROUP BY query instead of 4 queries per site
    site_counts_q = await db.execute(
        select(
            Site.id,
            Site.name,
            func.count(Device.id).label("total"),
            func.sum(case((Device.status == DeviceStatus.online, 1), else_=0)).label("online"),
            func.sum(case((Device.status == DeviceStatus.degraded, 1), else_=0)).label("degraded"),
            func.sum(case((Device.status == DeviceStatus.offline, 1), else_=0)).label("offline"),
        )
        .join(Device, Device.site_id == Site.id, isouter=True)
        .where(Site.is_active == True)
        .filter((Device.is_active == True) | (Device.id.is_(None)))
        .group_by(Site.id, Site.name)
    )
    site_statuses = []
    for row in site_counts_q.all():
        t = row.total or 0
        on = int(row.online or 0)
        degraded = int(row.degraded or 0)
        off = int(row.offline or 0)
        site_statuses.append(SiteStatus(
            site_id=row.id,
            site_name=row.name,
            total_devices=t,
            online_devices=on,
            degraded_devices=degraded,
            offline_devices=off,
            uptime_percent=round((((on + degraded) / t) * 100) if t > 0 else 0, 1),
        ))

    # Critical alerts (open, top 10)
    crit_q = (
        select(Alert, Device.name.label("dn"), Site.name.label("sn"))
        .join(Device, Alert.device_id == Device.id)
        .join(Site, Device.site_id == Site.id)
        .where(Alert.status == "open", Device.is_active == True, Site.is_active == True)
        .order_by(Alert.created_at.desc())
        .limit(10)
    )
    crit_result = await db.execute(crit_q)
    critical_alerts = []
    for alert, dn, sn in crit_result.all():
        a = AlertOut.model_validate(alert)
        a.device_name = dn
        a.site_name = sn
        critical_alerts.append(a)

    # Offline cameras (top 20)
    off_cam_q = (
        select(Device, Site.name.label("sn"))
        .join(Site, Device.site_id == Site.id)
        .where(
            Device.device_type == DeviceType.camera,
            Device.is_active == True,
            Site.is_active == True,
            Device.status == DeviceStatus.offline,
        )
        .order_by(Device.downtime_start.asc())
        .limit(20)
    )
    off_cam_result = await db.execute(off_cam_q)
    offline_cameras = []
    for dev, sn in off_cam_result.all():
        d = DeviceOut.model_validate(dev)
        d.site_name = sn
        offline_cameras.append(d)

    # Critical NVRs (offline NVRs)
    crit_nvr_q = (
        select(Device, Site.name.label("sn"))
        .join(Site, Device.site_id == Site.id)
        .where(
            Device.device_type == DeviceType.nvr,
            Device.is_active == True,
            Site.is_active == True,
            Device.status == DeviceStatus.offline,
        )
        .limit(10)
    )
    crit_nvr_result = await db.execute(crit_nvr_q)
    critical_nvrs = []
    for dev, sn in crit_nvr_result.all():
        d = DeviceOut.model_validate(dev)
        d.site_name = sn
        critical_nvrs.append(d)

    return DashboardData(
        stats=stats,
        site_statuses=site_statuses,
        critical_alerts=critical_alerts,
        offline_cameras=offline_cameras,
        critical_nvrs=critical_nvrs,
    )
