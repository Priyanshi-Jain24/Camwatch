"""Add recording CheckType and UniqueConstraint on failure_counters

Revision ID: 20260618_failure_counter_recording
Revises: 20260608_enterprise_alerts
Create Date: 2026-06-18
"""

from alembic import op

revision = "20260618_failure_counter_recording"
down_revision = "20260608_enterprise_alerts"
branch_labels = None
depends_on = None


def upgrade():
    # Add recording value to the checktype enum
    op.execute("ALTER TYPE checktype ADD VALUE IF NOT EXISTS 'recording'")

    # Remove any duplicate (device_id, check_type) rows before adding constraint
    # Keep the row with the highest consecutive_failures (or latest updated_at)
    op.execute("""
        DELETE FROM failure_counters
        WHERE id NOT IN (
            SELECT DISTINCT ON (device_id, check_type) id
            FROM failure_counters
            ORDER BY device_id, check_type, consecutive_failures DESC, updated_at DESC
        )
    """)

    # Add unique constraint
    op.execute("""
        ALTER TABLE failure_counters
        ADD CONSTRAINT uq_failure_counter_device_check
        UNIQUE (device_id, check_type)
    """)


def downgrade():
    op.execute("ALTER TABLE failure_counters DROP CONSTRAINT IF EXISTS uq_failure_counter_device_check")
    # Note: PostgreSQL does not support DROP VALUE from enum; recording stays in the type.
