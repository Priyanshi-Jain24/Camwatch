from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime
import ipaddress
from app.models import DeviceType, DeviceStatus, AlertSeverity, AlertType, AlertState, CheckType, RtspMode, RtspStreamType, UserRole


def _strip_required(value: Any, field_name: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    value = value.strip()
    if not value:
        raise ValueError(f"{field_name} is required")
    return value


def _strip_optional(value: Any) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        return value
    value = value.strip()
    return value or None


def _validate_ip(value: str) -> str:
    stripped = value.strip()
    if "." not in stripped and ":" not in stripped:
        raise ValueError("ip_address must be a valid IPv4 or IPv6 address")
    try:
        ipaddress.ip_address(stripped)
    except ValueError:
        raise ValueError("ip_address must be a valid IPv4 or IPv6 address")
    return stripped


# ─── Auth ─────────────────────────────────────────────────────────────────────
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class GoogleLoginRequest(BaseModel):
    credential: str


class GoogleSsoConfig(BaseModel):
    enabled: bool
    client_id: Optional[str] = None


class TokenData(BaseModel):
    user_id: Optional[str] = None


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    is_active: bool = True
    is_superuser: bool = False
    role: UserRole = UserRole.USER


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None


class UserOut(UserBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Site ─────────────────────────────────────────────────────────────────────
class SiteBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    city: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    regional_head_name: Optional[str] = None
    regional_head_contact: Optional[str] = None
    regional_manager_name: Optional[str] = None
    regional_manager_contact: Optional[str] = None
    is_active: bool = True

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, value: Any) -> str:
        return _strip_required(value, "name")

    @field_validator(
        "city", "address", "contact_name", "contact_phone", "contact_email",
        "regional_head_name", "regional_head_contact", "regional_manager_name",
        "regional_manager_contact",
        mode="before",
    )
    @classmethod
    def normalize_optional_strings(cls, value: Any) -> Optional[str]:
        return _strip_optional(value)


class SiteCreate(SiteBase):
    pass


class SiteUpdate(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    regional_head_name: Optional[str] = None
    regional_head_contact: Optional[str] = None
    regional_manager_name: Optional[str] = None
    regional_manager_contact: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, value: Any) -> Optional[str]:
        if value is None:
            return None
        return _strip_required(value, "name")

    @field_validator(
        "city", "address", "contact_name", "contact_phone", "contact_email",
        "regional_head_name", "regional_head_contact", "regional_manager_name",
        "regional_manager_contact",
        mode="before",
    )
    @classmethod
    def normalize_optional_strings(cls, value: Any) -> Optional[str]:
        return _strip_optional(value)


class SiteOut(SiteBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    total_devices: Optional[int] = 0
    online_devices: Optional[int] = 0
    degraded_devices: Optional[int] = 0
    offline_devices: Optional[int] = 0

    class Config:
        from_attributes = True


# ─── Device ───────────────────────────────────────────────────────────────────
class DeviceBase(BaseModel):
    name: str
    site_id: str
    nvr_id: Optional[str] = None
    device_type: DeviceType
    ip_address: str
    port: int = 80
    rtsp_port: int = 554
    username: Optional[str] = None
    password: Optional[str] = None
    rtsp_mode: RtspMode = RtspMode.auto
    rtsp_stream_type: RtspStreamType = RtspStreamType.main
    rtsp_url: Optional[str] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    mac_address: Optional[str] = None
    area: Optional[str] = None
    channel_count: Optional[int] = None
    channels_used: Optional[int] = None
    http_url: Optional[str] = None
    api_url: Optional[str] = None
    recording_check_url: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class DeviceCreate(DeviceBase):
    name: str = Field(..., min_length=1, max_length=255)
    site_id: str = Field(..., min_length=1)
    ip_address: str = Field(..., min_length=1, max_length=50)
    port: int = Field(default=80, ge=1, le=65535)
    rtsp_port: int = Field(default=554, ge=1, le=65535)

    @field_validator("name", "site_id", "ip_address", mode="before")
    @classmethod
    def validate_required_strings(cls, value: Any, info) -> str:
        return _strip_required(value, info.field_name)

    @field_validator("ip_address")
    @classmethod
    def validate_ip_address(cls, value: str) -> str:
        return _validate_ip(value)

    @field_validator(
        "nvr_id", "username", "password", "rtsp_url", "vendor", "model",
        "serial_number", "firmware_version", "mac_address", "area",
        "http_url", "api_url", "recording_check_url", "notes",
        mode="before",
    )
    @classmethod
    def normalize_optional_strings(cls, value: Any) -> Optional[str]:
        return _strip_optional(value)


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    site_id: Optional[str] = None
    nvr_id: Optional[str] = None
    device_type: Optional[DeviceType] = None
    ip_address: Optional[str] = None
    port: Optional[int] = Field(default=None, ge=1, le=65535)
    rtsp_port: Optional[int] = Field(default=None, ge=1, le=65535)
    username: Optional[str] = None
    password: Optional[str] = None
    rtsp_mode: Optional[RtspMode] = None
    rtsp_stream_type: Optional[RtspStreamType] = None
    rtsp_url: Optional[str] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    mac_address: Optional[str] = None
    area: Optional[str] = None
    channel_count: Optional[int] = None
    channels_used: Optional[int] = None
    http_url: Optional[str] = None
    api_url: Optional[str] = None
    recording_check_url: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("name", "site_id", "ip_address", mode="before")
    @classmethod
    def validate_required_strings(cls, value: Any, info) -> Optional[str]:
        if value is None:
            return None
        return _strip_required(value, info.field_name)

    @field_validator("ip_address")
    @classmethod
    def validate_ip_address(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return _validate_ip(value)

    @field_validator(
        "nvr_id", "username", "password", "rtsp_url", "vendor", "model",
        "serial_number", "firmware_version", "mac_address", "area",
        "http_url", "api_url", "recording_check_url", "notes",
        mode="before",
    )
    @classmethod
    def normalize_optional_strings(cls, value: Any) -> Optional[str]:
        return _strip_optional(value)


class DeviceOut(DeviceBase):
    id: str
    status: DeviceStatus
    ping_status: Optional[bool] = None
    rtsp_status: Optional[bool] = None
    api_status: Optional[bool] = None
    latest_ping_latency_ms: Optional[float] = None
    latest_ping_packet_loss_pct: Optional[float] = None
    last_seen: Optional[datetime] = None
    downtime_start: Optional[datetime] = None
    downtime_seconds: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    site_name: Optional[str] = None
    nvr_name: Optional[str] = None

    class Config:
        from_attributes = True


class DeviceDetail(DeviceOut):
    recent_checks: Optional[List["CheckLogOut"]] = []
    open_alerts: Optional[List["AlertOut"]] = []

    class Config:
        from_attributes = True


class DeviceHealthCheckOut(BaseModel):
    key: str
    label: str
    status: str
    reason: str
    metrics: Optional[str] = None
    observed_at: Optional[datetime] = None


class DeviceHealthTimelineCheckOut(BaseModel):
    label: str
    status: str
    detail: str


class DeviceHealthTimelineBucketOut(BaseModel):
    start_at: datetime
    end_at: datetime
    status: str
    reason: str
    checks: List[DeviceHealthTimelineCheckOut]


class DeviceHealthEventOut(BaseModel):
    timestamp: datetime
    severity: str
    title: str
    reason: Optional[str] = None
    status: str


class DeviceHealthHistoryResponse(BaseModel):
    device_id: str
    current_status: str
    last_seen: Optional[datetime] = None
    latency_ms: Optional[float] = None
    uptime_24h_percent: float
    online_minutes: int
    degraded_minutes: int
    offline_minutes: int
    no_data_minutes: int
    current_checks: List[DeviceHealthCheckOut]
    timeline: List[DeviceHealthTimelineBucketOut]
    events: List[DeviceHealthEventOut]


# ─── CheckLog ─────────────────────────────────────────────────────────────────
class CheckLogOut(BaseModel):
    id: str
    device_id: str
    check_type: CheckType
    success: bool
    latency_ms: Optional[float] = None
    packet_loss_pct: Optional[float] = None
    error_message: Optional[str] = None
    checked_at: datetime

    class Config:
        from_attributes = True


# ─── Alert ────────────────────────────────────────────────────────────────────
class AlertOut(BaseModel):
    id: str
    device_id: str
    site_id: Optional[str] = None
    device_type: Optional[str] = None
    alert_type: AlertType
    severity: AlertSeverity
    state: AlertState
    status: Optional[str] = None
    title: str
    message: Optional[str] = None
    description: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None
    recovered_at: Optional[datetime] = None
    escalated_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    occurrence_count: int = 1
    created_at: datetime
    device_name: Optional[str] = None
    site_name: Optional[str] = None

    class Config:
        from_attributes = True


class AlertAcknowledge(BaseModel):
    alert_id: str


class AlertResolve(BaseModel):
    alert_id: str


# ─── Dashboard ────────────────────────────────────────────────────────────────
class AlertHistoryOut(BaseModel):
    id: str
    alert_id: str
    from_status: Optional[str] = None
    to_status: str
    note: Optional[str] = None
    actor_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationLogOut(BaseModel):
    id: str
    alert_id: Optional[str] = None
    channel: str
    recipient: str
    message: str
    status: str
    delivery_error: Optional[str] = None
    sent_at: datetime

    class Config:
        from_attributes = True


class AlertHistoryResponse(BaseModel):
    alert: AlertOut
    history: List[AlertHistoryOut]
    notifications: List[NotificationLogOut]


class TestEmailRequest(BaseModel):
    to_email: EmailStr


class TestEmailResponse(BaseModel):
    success: bool
    status: str
    detail: str
    delivery_error: Optional[str] = None


class DashboardStats(BaseModel):
    total_cameras: int
    online_cameras: int
    degraded_cameras: int = 0
    offline_cameras: int
    standalone_cameras: int = 0
    nvr_linked_cameras: int = 0
    total_nvrs: int
    online_nvrs: int
    degraded_nvrs: int = 0
    offline_nvrs: int
    healthy_nvrs: int = 0
    failed_nvrs: int = 0
    total_sites: int
    active_alerts: int
    critical_alerts: int


class SiteStatus(BaseModel):
    site_id: str
    site_name: str
    total_devices: int
    online_devices: int
    degraded_devices: int = 0
    offline_devices: int
    uptime_percent: float


class DashboardData(BaseModel):
    stats: DashboardStats
    site_statuses: List[SiteStatus]
    critical_alerts: List[AlertOut]
    offline_cameras: List[DeviceOut]
    critical_nvrs: List[DeviceOut]


# ─── Import ───────────────────────────────────────────────────────────────────
class ImportLogOut(BaseModel):
    id: str
    filename: Optional[str]
    total_rows: int
    success_rows: int
    failed_rows: int
    errors: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Reports ──────────────────────────────────────────────────────────────────
class UptimeReportRow(BaseModel):
    device_id: str
    device_name: str
    site_name: str
    device_type: str
    uptime_percent: float
    downtime_seconds: int
    total_checks: int
    successful_checks: int


class UptimeReport(BaseModel):
    period: str
    start_date: datetime
    end_date: datetime
    rows: List[UptimeReportRow]


class SiteUptimeReportRow(BaseModel):
    site_id: str
    site_name: str
    total_devices: int
    camera_count: int
    nvr_count: int
    uptime_percent: float
    downtime_seconds: int
    total_checks: int
    successful_checks: int


class SiteUptimeReport(BaseModel):
    period: str
    start_date: datetime
    end_date: datetime
    rows: List[SiteUptimeReportRow]


# ─── Pagination ───────────────────────────────────────────────────────────────
class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    per_page: int
    pages: int


DeviceDetail.model_rebuild()
