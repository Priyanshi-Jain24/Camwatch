"""enterprise alert management additive migration

Revision ID: 20260608_enterprise_alerts
Revises:
Create Date: 2026-06-08
"""

from alembic import op

revision = "20260608_enterprise_alerts"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE alerttype ADD VALUE IF NOT EXISTS 'nvr_ping_failure'")
    op.execute("ALTER TYPE alerttype ADD VALUE IF NOT EXISTS 'nvr_http_failure'")
    op.execute("ALTER TYPE alerttype ADD VALUE IF NOT EXISTS 'nvr_rtsp_failure'")
    op.execute("ALTER TYPE alerttype ADD VALUE IF NOT EXISTS 'nvr_recording_failure'")
    op.execute("ALTER TYPE alertstate ADD VALUE IF NOT EXISTS 'recovered'")

    op.execute("ALTER TABLE devices ADD COLUMN IF NOT EXISTS nvr_id UUID REFERENCES devices(id) ON DELETE SET NULL")
    op.execute("ALTER TABLE devices ADD COLUMN IF NOT EXISTS area VARCHAR(255)")
    op.execute("ALTER TABLE devices ADD COLUMN IF NOT EXISTS channel_count INTEGER")
    op.execute("ALTER TABLE devices ADD COLUMN IF NOT EXISTS http_url TEXT")
    op.execute("ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_url TEXT")
    op.execute("ALTER TABLE devices ADD COLUMN IF NOT EXISTS recording_check_url TEXT")

    op.execute("ALTER TABLE sites ADD COLUMN IF NOT EXISTS regional_head_name VARCHAR(255)")
    op.execute("ALTER TABLE sites ADD COLUMN IF NOT EXISTS regional_head_contact VARCHAR(255)")
    op.execute("ALTER TABLE sites ADD COLUMN IF NOT EXISTS regional_manager_name VARCHAR(255)")
    op.execute("ALTER TABLE sites ADD COLUMN IF NOT EXISTS regional_manager_contact VARCHAR(255)")

    op.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id)")
    op.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS device_name VARCHAR(255)")
    op.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS device_type VARCHAR(50)")
    op.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS status VARCHAR(50)")
    op.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS message TEXT")
    op.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMPTZ")
    op.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ")
    op.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id)")
    op.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ")
    op.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS occurrence_count INTEGER DEFAULT 1")

    op.execute("""
        CREATE TABLE IF NOT EXISTS alert_history (
            id UUID PRIMARY KEY,
            alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
            from_status VARCHAR(50),
            to_status VARCHAR(50) NOT NULL,
            note TEXT,
            actor_id UUID REFERENCES users(id),
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS notification_logs (
            id UUID PRIMARY KEY,
            alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
            channel VARCHAR(50) NOT NULL,
            recipient VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            status VARCHAR(50) DEFAULT 'sent',
            sent_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS failure_counters (
            id UUID PRIMARY KEY,
            device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
            check_type VARCHAR(50) NOT NULL,
            consecutive_failures INTEGER DEFAULT 0,
            last_failure_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)


def downgrade():
    pass
