import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from app.core.config import settings

logger = logging.getLogger("scheduler")
scheduler = AsyncIOScheduler()


def setup_scheduler():
    from app.workers.monitor import (
        run_ping_checks,
        run_all_checks,
        run_alert_escalations,
        run_notification_retries,
    )

    # Lightweight ping check runs frequently (default 60s)
    scheduler.add_job(
        run_ping_checks,
        trigger=IntervalTrigger(seconds=settings.PING_INTERVAL_SECONDS),
        id="ping_all",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # Full service check (RTSP + API) runs less frequently (default 300s)
    scheduler.add_job(
        run_all_checks,
        trigger=IntervalTrigger(seconds=settings.RTSP_INTERVAL_SECONDS),
        id="service_checks",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    scheduler.add_job(
        run_alert_escalations,
        trigger=IntervalTrigger(minutes=5),
        id="alert_escalations",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # Retry notifications whose delivery failed (SMTP/Gmail/network hiccup).
    scheduler.add_job(
        run_notification_retries,
        trigger=IntervalTrigger(minutes=2),
        id="notification_retries",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    logger.info(
        "Scheduler configured: ping every %ss, service checks every %ss",
        settings.PING_INTERVAL_SECONDS,
        settings.RTSP_INTERVAL_SECONDS,
    )
    return scheduler
