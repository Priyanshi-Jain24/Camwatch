from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.core.config import settings
from app.api.v1 import api_router
from app.db.session import engine, AsyncSessionLocal
from app.db.init_db import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting CamWatch API...")
    scheduler = None

    if settings.RUN_DB_INIT:
        logger.info("Running DB initialization in API process")
        async with AsyncSessionLocal() as db:
            await init_db(db)
    else:
        logger.info("Skipping DB initialization in API process")

    if settings.RUN_SCHEDULER:
        from app.workers.scheduler import setup_scheduler
        scheduler = setup_scheduler()
        scheduler.start()
        logger.info("Monitoring scheduler started in API process")
    else:
        logger.info("Monitoring scheduler disabled in API process")

    yield

    if scheduler is not None:
        scheduler.shutdown()
        logger.info("Scheduler stopped")
    await engine.dispose()


app = FastAPI(
    title="CamWatch API",
    description="CCTV & NVR Monitoring Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "camwatch"}
