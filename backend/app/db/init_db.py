import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.db.session import Base, engine
from app.models import User, UserRole
from app.core.security import get_password_hash
from app.core.config import settings

logger = logging.getLogger(__name__)


ALERT_TYPE_VALUES = [
    "nvr_ping_failure",
    "nvr_http_failure",
    "nvr_rtsp_failure",
    "nvr_recording_failure",
]

ALERT_STATE_VALUES = ["recovered"]
DEVICE_STATUS_VALUES = ["degraded"]


async def _run_startup_migrations(conn):
    for value in ALERT_TYPE_VALUES:
        await conn.execute(text(f"ALTER TYPE alerttype ADD VALUE IF NOT EXISTS '{value}'"))
    for value in ALERT_STATE_VALUES:
        await conn.execute(text(f"ALTER TYPE alertstate ADD VALUE IF NOT EXISTS '{value}'"))
    for value in DEVICE_STATUS_VALUES:
        await conn.execute(text(f"ALTER TYPE devicestatus ADD VALUE IF NOT EXISTS '{value}'"))

    statements = [
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS nvr_id UUID REFERENCES devices(id) ON DELETE SET NULL",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS area VARCHAR(255)",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS channel_count INTEGER",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS channels_used INTEGER",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS http_url TEXT",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_url TEXT",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS recording_check_url TEXT",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS rtsp_port INTEGER",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS rtsp_mode VARCHAR(20)",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS rtsp_stream_type VARCHAR(20)",
        "ALTER TABLE devices ADD COLUMN IF NOT EXISTS ping_packet_loss_pct DOUBLE PRECISION",
        "ALTER TABLE check_logs ADD COLUMN IF NOT EXISTS packet_loss_pct DOUBLE PRECISION",
        "ALTER TABLE sites ADD COLUMN IF NOT EXISTS regional_head_name VARCHAR(255)",
        "ALTER TABLE sites ADD COLUMN IF NOT EXISTS regional_head_contact VARCHAR(255)",
        "ALTER TABLE sites ADD COLUMN IF NOT EXISTS regional_manager_name VARCHAR(255)",
        "ALTER TABLE sites ADD COLUMN IF NOT EXISTS regional_manager_contact VARCHAR(255)",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id)",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS device_name VARCHAR(255)",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS device_type VARCHAR(50)",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS status VARCHAR(50)",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS message TEXT",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMPTZ",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id)",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ",
        "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS occurrence_count INTEGER DEFAULT 1",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20)",
        "ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS delivery_error TEXT",
        "ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS subject TEXT",
        "ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0",
        "ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ",
        f"ALTER TABLE users ALTER COLUMN role SET DEFAULT '{UserRole.USER.value}'",
        """
        UPDATE alerts
        SET status = COALESCE(status, state::text),
            message = COALESCE(message, description),
            last_seen_at = COALESCE(last_seen_at, created_at),
            occurrence_count = COALESCE(occurrence_count, 1)
        """,
        """
        UPDATE devices
        SET rtsp_port = COALESCE(rtsp_port, 554)
        """,
        """
        UPDATE devices
        SET rtsp_mode = CASE
            WHEN COALESCE(NULLIF(rtsp_url, ''), '') <> '' THEN 'custom'
            ELSE 'disabled'
        END
        WHERE rtsp_mode IS NULL
        """,
        """
        UPDATE devices
        SET rtsp_stream_type = COALESCE(rtsp_stream_type, 'main')
        WHERE rtsp_stream_type IS NULL
        """,
        """
        UPDATE devices
        SET status = 'online'
        WHERE status::text = 'degraded'
        """,
        """
        UPDATE alerts
        SET site_id = devices.site_id,
            device_name = COALESCE(alerts.device_name, devices.name),
            device_type = COALESCE(alerts.device_type, devices.device_type::text)
        FROM devices
        WHERE alerts.device_id = devices.id
        """,
        f"""
        UPDATE users
        SET role = CASE
            WHEN is_superuser = TRUE THEN '{UserRole.ADMIN.value}'
            ELSE '{UserRole.USER.value}'
        END
        WHERE role IS NULL OR role = ''
        """,
    ]
    for statement in statements:
        await conn.execute(text(statement))


async def init_db(db: AsyncSession):
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _run_startup_migrations(conn)

    # Seed superuser
    result = await db.execute(select(User).where(User.email == settings.FIRST_SUPERUSER_EMAIL))
    admin_user = result.scalar_one_or_none()
    if not admin_user:
        user = User(
            email=settings.FIRST_SUPERUSER_EMAIL,
            hashed_password=get_password_hash(settings.FIRST_SUPERUSER_PASSWORD),
            full_name="Administrator",
            is_superuser=True,
            role=UserRole.ADMIN.value,
            is_active=True,
        )
        db.add(user)
        logger.info(f"Superuser created: {settings.FIRST_SUPERUSER_EMAIL}")
    else:
        admin_user.is_superuser = True
        admin_user.is_active = True
        admin_user.role = UserRole.ADMIN.value

    # Seed a read-only test user for RBAC validation
    viewer_email = "user@camwatch.com"
    result = await db.execute(select(User).where(User.email == viewer_email))
    viewer_user = result.scalar_one_or_none()
    if not viewer_user:
        viewer_user = User(
            email=viewer_email,
            hashed_password=get_password_hash("user123"),
            full_name="Monitoring User",
            is_superuser=False,
            role=UserRole.USER.value,
            is_active=True,
        )
        db.add(viewer_user)
        logger.info("Read-only test user created: user@camwatch.com")
    else:
        viewer_user.is_superuser = False
        viewer_user.is_active = True
        viewer_user.role = UserRole.USER.value

    await db.commit()
