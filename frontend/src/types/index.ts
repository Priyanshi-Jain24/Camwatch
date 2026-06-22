export type DeviceType = 'camera' | 'nvr'
export type DeviceStatus = 'online' | 'degraded' | 'offline' | 'unknown'
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'
export type AlertType =
  | 'camera_offline'
  | 'rtsp_failure'
  | 'nvr_offline'
  | 'api_failure'
  | 'ping_failure'
  | 'nvr_ping_failure'
  | 'nvr_http_failure'
  | 'nvr_rtsp_failure'
  | 'nvr_recording_failure'
export type AlertState = 'open' | 'acknowledged' | 'recovered' | 'resolved'
export type CheckType = 'ping' | 'rtsp' | 'api' | 'recording'
export type RtspMode = 'disabled' | 'auto' | 'custom'
export type RtspStreamType = 'main' | 'sub'
export type Theme = 'dark' | 'light'
export type UserRole = 'ADMIN' | 'USER'

export interface User {
  id: string
  email: string
  full_name?: string
  is_active: boolean
  is_superuser: boolean
  role: UserRole
  created_at: string
}

export interface Site {
  id: string
  name: string
  city?: string
  address?: string
  latitude?: number
  longitude?: number
  contact_name?: string
  contact_phone?: string
  contact_email?: string
  regional_head_name?: string
  regional_head_contact?: string
  regional_manager_name?: string
  regional_manager_contact?: string
  is_active: boolean
  created_at: string
  updated_at?: string
  total_devices?: number
  online_devices?: number
  degraded_devices?: number
  offline_devices?: number
}

export interface Device {
  id: string
  name: string
  site_id: string
  site_name?: string
  device_type: DeviceType
  ip_address: string
  port: number
  rtsp_port: number
  username?: string
  password?: string
  rtsp_mode: RtspMode
  rtsp_stream_type: RtspStreamType
  rtsp_url?: string
  vendor?: string
  model?: string
  serial_number?: string
  firmware_version?: string
  mac_address?: string
  area?: string
  channel_count?: number
  channels_used?: number
  http_url?: string
  api_url?: string
  recording_check_url?: string
  notes?: string
  is_active: boolean
  status: DeviceStatus
  ping_status?: boolean
  rtsp_status?: boolean
  api_status?: boolean
  latest_ping_latency_ms?: number
  latest_ping_packet_loss_pct?: number
  last_seen?: string
  downtime_start?: string
  downtime_seconds: number
  created_at: string
  updated_at?: string
  // NVR relationship
  nvr_id?: string | null
  nvr_name?: string | null
}

export interface DeviceDetail extends Device {
  recent_checks: CheckLog[]
  open_alerts: Alert[]
}

export interface CheckLog {
  id: string
  device_id: string
  check_type: CheckType
  success: boolean
  latency_ms?: number
  packet_loss_pct?: number
  error_message?: string
  checked_at: string
}

export interface Alert {
  id: string
  device_id: string
  site_id?: string
  device_type?: DeviceType
  alert_type: AlertType
  severity: AlertSeverity
  state: AlertState
  status?: AlertState
  title: string
  message?: string
  description?: string
  acknowledged_at?: string
  acknowledged_by?: string
  recovered_at?: string
  escalated_at?: string
  resolved_at?: string
  resolved_by?: string
  last_seen_at?: string
  occurrence_count: number
  created_at: string
  device_name?: string
  site_name?: string
}

export interface DashboardStats {
  total_cameras: number
  online_cameras: number
  degraded_cameras: number
  offline_cameras: number
  standalone_cameras: number
  nvr_linked_cameras: number
  total_nvrs: number
  online_nvrs: number
  degraded_nvrs: number
  offline_nvrs: number
  healthy_nvrs: number
  failed_nvrs: number
  total_sites: number
  active_alerts: number
  critical_alerts: number
}

export interface SiteStatus {
  site_id: string
  site_name: string
  total_devices: number
  online_devices: number
  degraded_devices: number
  offline_devices: number
  uptime_percent: number
}

export interface DashboardData {
  stats: DashboardStats
  site_statuses: SiteStatus[]
  critical_alerts: Alert[]
  offline_cameras: Device[]
  critical_nvrs: Device[]
}

export interface ImportLog {
  id: string
  filename?: string
  total_rows: number
  success_rows: number
  failed_rows: number
  errors?: string
  created_at: string
}

export interface UptimeReportRow {
  device_id: string
  device_name: string
  site_name: string
  device_type: string
  uptime_percent: number
  downtime_seconds: number
  total_checks: number
  successful_checks: number
}

export interface UptimeReport {
  period: string
  start_date: string
  end_date: string
  rows: UptimeReportRow[]
}

export interface SiteUptimeReportRow {
  site_id: string
  site_name: string
  total_devices: number
  camera_count: number
  nvr_count: number
  uptime_percent: number
  downtime_seconds: number
  total_checks: number
  successful_checks: number
}

export interface SiteUptimeReport {
  period: string
  start_date: string
  end_date: string
  rows: SiteUptimeReportRow[]
}

export interface Token {
  access_token: string
  token_type: string
}

export interface GoogleSsoConfig {
  enabled: boolean
  client_id?: string | null
}

export interface AlertHistoryItem {
  id: string
  alert_id: string
  from_status?: string
  to_status: string
  note?: string
  actor_id?: string
  created_at: string
}

export interface NotificationLog {
  id: string
  alert_id?: string
  channel: string
  recipient: string
  message: string
  status: string
  sent_at: string
}

export interface AlertHistoryResponse {
  alert: Alert
  history: AlertHistoryItem[]
  notifications: NotificationLog[]
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}
