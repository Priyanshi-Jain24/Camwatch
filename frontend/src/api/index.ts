import api from './client'
import type {
  Alert,
  AlertHistoryResponse,
  AlertSeverity,
  AlertState,
  AlertType,
  DashboardData,
  Device,
  DeviceDetail,
  DeviceHealthHistory,
  DeviceStatus,
  DeviceType,
  GoogleSsoConfig,
  ImportLog,
  Site,
  SiteUptimeReport,
  Token,
  UptimeReport,
  User,
} from '@/types'

export const authApi = {
  login: async (email: string, password: string): Promise<Token> => {
    const form = new URLSearchParams({ username: email, password })
    const { data } = await api.post<Token>('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return data
  },
  googleConfig: async (): Promise<GoogleSsoConfig> =>
    (await api.get<GoogleSsoConfig>('/auth/google/config')).data,
  googleLogin: async (credential: string): Promise<Token> =>
    (await api.post<Token>('/auth/google/login', { credential })).data,
  me: async (): Promise<User> => (await api.get<User>('/auth/me')).data,
  register: async (email: string, password: string, full_name?: string): Promise<User> =>
    (await api.post<User>('/auth/register', { email, password, full_name })).data,
}

export const dashboardApi = {
  get: async (): Promise<DashboardData> => (await api.get<DashboardData>('/dashboard/')).data,
}

export const sitesApi = {
  list: async (): Promise<Site[]> => (await api.get<Site[]>('/sites/')).data,
  get: async (id: string): Promise<Site> => (await api.get<Site>(`/sites/${id}`)).data,
  create: async (data: Partial<Site>): Promise<Site> => (await api.post<Site>('/sites/', data)).data,
  update: async (id: string, data: Partial<Site>): Promise<Site> =>
    (await api.put<Site>(`/sites/${id}`, data)).data,
  delete: async (id: string): Promise<void> => { await api.delete(`/sites/${id}`) },
}

export const devicesApi = {
  list: async (params?: {
    site_id?: string
    device_type?: DeviceType
    status?: DeviceStatus
    skip?: number
    limit?: number
  }): Promise<Device[]> => (await api.get<Device[]>('/devices/', { params })).data,

  get: async (id: string): Promise<DeviceDetail> =>
    (await api.get<DeviceDetail>(`/devices/${id}`)).data,

  healthHistory: async (id: string): Promise<DeviceHealthHistory> =>
    (await api.get<DeviceHealthHistory>(`/devices/${id}/health-history`)).data,

  create: async (data: Partial<Device>): Promise<Device> =>
    (await api.post<Device>('/devices/', data)).data,

  update: async (id: string, data: Partial<Device>): Promise<Device> =>
    (await api.put<Device>(`/devices/${id}`, data)).data,

  delete: async (id: string): Promise<void> => { await api.delete(`/devices/${id}`) },

  triggerCheck: async (id: string): Promise<{ message: string }> =>
    (await api.post(`/devices/${id}/trigger-check`)).data,

  importCsv: async (file: File): Promise<ImportLog> => {
    const form = new FormData()
    form.append('file', file)
    return (await api.post<ImportLog>('/devices/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })).data
  },

  importHistory: async (): Promise<ImportLog[]> =>
    (await api.get<ImportLog[]>('/devices/import/history')).data,

  downloadTemplate: () => { window.open('/api/v1/devices/import/template', '_blank') },
}

export const alertsApi = {
  list: async (params?: {
    status?: AlertState
    state?: AlertState
    include_resolved?: boolean
    severity?: AlertSeverity
    alert_type?: AlertType
    device_type?: DeviceType
    site_id?: string
  }): Promise<Alert[]> => (await api.get<Alert[]>('/alerts/', { params })).data,

  acknowledge: async (id: string): Promise<Alert> =>
    (await api.post<Alert>(`/alerts/${id}/acknowledge`)).data,

  recover: async (id: string): Promise<Alert> =>
    (await api.post<Alert>(`/alerts/${id}/recover`)).data,

  resolve: async (id: string, force = false): Promise<Alert> =>
    (await api.post<Alert>(`/alerts/${id}/resolve`, null, { params: force ? { force: true } : undefined })).data,

  summary: async (): Promise<{ open: number; acknowledged: number; critical_open: number }> =>
    (await api.get('/alerts/summary')).data,

  history: async (id: string): Promise<AlertHistoryResponse> =>
    (await api.get<AlertHistoryResponse>(`/alerts/${id}/history`)).data,
}

export const reportsApi = {
  uptime: async (period: 'daily' | 'weekly' | 'monthly'): Promise<UptimeReport> =>
    (await api.get<UptimeReport>('/reports/uptime', { params: { period } })).data,
  siteUptime: async (period: 'daily' | 'weekly' | 'monthly'): Promise<SiteUptimeReport> =>
    (await api.get<SiteUptimeReport>('/reports/uptime/sites', { params: { period } })).data,
}

export const discoveryApi = {
  discover: async (ip: string, device_id?: string) =>
    (await api.post('/discovery/discover', null, { params: { ip_address: ip, device_id } })).data,
  scanSubnet: async (subnet: string) =>
    (await api.post('/discovery/scan-subnet', null, { params: { subnet } })).data,
}
