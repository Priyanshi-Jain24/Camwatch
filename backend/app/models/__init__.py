import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey,
    Integer, Float, Text, Enum as SAEnum, func, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.db.session import Base


def gen_uuid():
    return str(uuid.uuid4())


class DeviceType(str, enum.Enum):
    camera = "camera"
    nvr = "nvr"


class DeviceStatus(str, enum.Enum):
    online = "online"
    degraded = "degraded"
    offline = "offline"
    unknown = "unknown"


class AlertSeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class AlertType(str, enum.Enum):
    camera_offline = "camera_offline"
    rtsp_failure = "rtsp_failure"
    nvr_offline = "nvr_offline"
    api_failure = "api_failure"
    ping_failure = "ping_failure"
    nvr_ping_failure = "nvr_ping_failure"
    nvr_http_failure = "nvr_http_failure"
    nvr_rtsp_failure = "nvr_rtsp_failure"
    nvr_recording_failure = "nvr_recording_failure"


class AlertState(str, enum.Enum):
    open = "open"
    acknowledged = "acknowledged"
    recovered = "recovered"
    resolved = "resolved"


class CheckType(str, enum.Enum):
    ping = "ping"
    rtsp = "rtsp"
    api = "api"
    recording = "recording"


class RtspMode(str, enum.Enum):
    disabled = "disabled"
    auto = "auto"
    custom = "custom"


class RtspStreamType(str, enum.Enum):
    main = "main"
    sub = "sub"


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    USER = "USER"


# ─── User ─────────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    role = Column(String(20), nullable=False, default=UserRole.USER.value)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ─── Site ─────────────────────────────────────────────────────────────────────
class Site(Base):
    __tablename__ = "sites"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    city = Column(String(255))
    address = Column(Text)
    latitude = Column(Float)
    longitude = Column(Float)
    contact_name = Column(String(255))
    contact_phone = Column(String(50))
    contact_email = Column(String(255))
    regional_head_name = Column(String(255))
    regional_head_contact = Column(String(255))
    regional_manager_name = Column(String(255))
    regional_manager_contact = Column(String(255))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    devices = relationship("Device", back_populates="site", cascade="all, delete-orphan")


# ─── Device ───────────────────────────────────────────────────────────────────
class Device(Base):
    __tablename__ = "devices"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    site_id = Column(UUID(as_uuid=False), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False)
    nvr_id = Column(UUID(as_uuid=False), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    device_type = Column(SAEnum(DeviceType), nullable=False)
    ip_address = Column(String(50), nullable=False)
    port = Column(Integer, default=80)
    rtsp_port = Column(Integer, default=554)
    username = Column(String(255))
    password = Column(String(255))
    rtsp_mode = Column(String(20), default=RtspMode.auto.value, nullable=False)
    rtsp_stream_type = Column(String(20), default=RtspStreamType.main.value, nullable=False)
    rtsp_url = Column(Text)
    vendor = Column(String(255))
    model = Column(String(255))
    serial_number = Column(String(255))
    firmware_version = Column(String(255))
    mac_address = Column(String(50))
    area = Column(String(255))
    channel_count = Column(Integer)
    channels_used = Column(Integer)
    http_url = Column(Text)
    api_url = Column(Text)
    recording_check_url = Column(Text)
    notes = Column(Text)
    is_active = Column(Boolean, default=True)

    # Runtime status
    status = Column(SAEnum(DeviceStatus), default=DeviceStatus.unknown)
    ping_status = Column(Boolean)
    rtsp_status = Column(Boolean)
    api_status = Column(Boolean)
    ping_packet_loss_pct = Column(Float)
    last_seen = Column(DateTime(timezone=True))
    downtime_start = Column(DateTime(timezone=True))
    downtime_seconds = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    site = relationship("Site", back_populates="devices")
    nvr = relationship("Device", remote_side=[id], back_populates="cameras", foreign_keys=[nvr_id])
    cameras = relationship("Device", back_populates="nvr", foreign_keys=[nvr_id])
    check_logs = relationship("CheckLog", back_populates="device", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="device", cascade="all, delete-orphan")


# ─── CheckLog ─────────────────────────────────────────────────────────────────
class CheckLog(Base):
    __tablename__ = "check_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    device_id = Column(UUID(as_uuid=False), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    check_type = Column(SAEnum(CheckType), nullable=False)
    success = Column(Boolean, nullable=False)
    latency_ms = Column(Float)
    packet_loss_pct = Column(Float)
    error_message = Column(Text)
    checked_at = Column(DateTime(timezone=True), server_default=func.now())

    device = relationship("Device", back_populates="check_logs")


# ─── Alert ────────────────────────────────────────────────────────────────────
class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    site_id = Column(UUID(as_uuid=False), ForeignKey("sites.id"), nullable=True)
    device_id = Column(UUID(as_uuid=False), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    device_name = Column(String(255))
    device_type = Column(String(50))
    alert_type = Column(SAEnum(AlertType), nullable=False)
    severity = Column(SAEnum(AlertSeverity), nullable=False)
    state = Column(SAEnum(AlertState), default=AlertState.open)
    status = Column(String(50), default="open", index=True)
    title = Column(String(500), nullable=False)
    message = Column(Text)
    description = Column(Text)
    acknowledged_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True))
    recovered_at = Column(DateTime(timezone=True))
    escalated_at = Column(DateTime(timezone=True))
    resolved_at = Column(DateTime(timezone=True))
    resolved_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    last_seen_at = Column(DateTime(timezone=True))
    occurrence_count = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    device = relationship("Device", back_populates="alerts")
    history = relationship("AlertHistory", back_populates="alert", cascade="all, delete-orphan")
    notifications = relationship("NotificationLog", back_populates="alert", cascade="all, delete-orphan")


class AlertHistory(Base):
    __tablename__ = "alert_history"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    alert_id = Column(UUID(as_uuid=False), ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False)
    from_status = Column(String(50))
    to_status = Column(String(50), nullable=False)
    note = Column(Text)
    actor_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    alert = relationship("Alert", back_populates="history")


class NotificationLog(Base):
    __tablename__ = "notification_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    alert_id = Column(UUID(as_uuid=False), ForeignKey("alerts.id", ondelete="CASCADE"), nullable=True)
    channel = Column(String(50), nullable=False)
    recipient = Column(String(255), nullable=False)
    subject = Column(Text)
    message = Column(Text, nullable=False)
    status = Column(String(50), default="sent")
    delivery_error = Column(Text)
    attempts = Column(Integer, default=0)
    next_attempt_at = Column(DateTime(timezone=True))
    sent_at = Column(DateTime(timezone=True), server_default=func.now())

    alert = relationship("Alert", back_populates="notifications")


class FailureCounter(Base):
    __tablename__ = "failure_counters"
    __table_args__ = (
        UniqueConstraint("device_id", "check_type", name="uq_failure_counter_device_check"),
    )

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    device_id = Column(UUID(as_uuid=False), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    check_type = Column(String(50), nullable=False)
    consecutive_failures = Column(Integer, default=0)
    last_failure_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ─── ImportLog ────────────────────────────────────────────────────────────────
class ImportLog(Base):
    __tablename__ = "import_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    filename = Column(String(500))
    total_rows = Column(Integer, default=0)
    success_rows = Column(Integer, default=0)
    failed_rows = Column(Integer, default=0)
    errors = Column(Text)
    imported_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ─── UptimeRecord (daily aggregates) ─────────────────────────────────────────
class UptimeRecord(Base):
    __tablename__ = "uptime_records"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    device_id = Column(UUID(as_uuid=False), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)
    uptime_seconds = Column(Integer, default=0)
    downtime_seconds = Column(Integer, default=0)
    total_checks = Column(Integer, default=0)
    successful_checks = Column(Integer, default=0)
    uptime_percent = Column(Float, default=100.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
