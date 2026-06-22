import asyncio
import logging
import signal

from app.core.config import settings
from app.db.session import AsyncSessionLocal, engine
from app.db.init_db import init_db
from app.workers.scheduler import setup_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("Starting CamWatch monitor service...")

    if settings.RUN_DB_INIT:
        logger.info("Running DB initialization in monitor process")
        async with AsyncSessionLocal() as db:
            await init_db(db)
    else:
        logger.info("Skipping DB initialization in monitor process")

    scheduler = setup_scheduler()
    scheduler.start()
    logger.info("Monitoring scheduler started in dedicated monitor service")

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    def _request_shutdown() -> None:
        logger.info("Monitor service shutdown requested")
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_shutdown)
        except NotImplementedError:
            pass

    try:
        await stop_event.wait()
    finally:
        scheduler.shutdown()
        logger.info("Monitoring scheduler stopped")
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
