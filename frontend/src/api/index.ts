import api from './client'
import { demoApi } from './demo'
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

const demoMode = (import.meta as any).env?.VITE_DEMO_MODE === 'true'

export const authApi = {
  login: async (email: string, password: string): Promise<Token> => {
    if (demoMode) return demoApi.auth.login()
    const form = new URLSearchParams({ username: email, password })
    const { data } = await api.post<Token>('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return data
  },
  googleConfig: async (): Promise<GoogleSsoConfig> =>
    demoMode ? demoApi.auth.googleConfig() :
    (await api.get<GoogleSsoConfig>('/auth/google/config')).data,
  googleLogin: async (credential: string): Promise<Token> =>
    demoMode ? demoApi.auth.googleLogin() :
    (await api.post<Token>('/auth/google/login', { credential })).data,
  me: async (): Promise<User> => demoMode ? demoApi.auth.me() : (await api.get<User>('/auth/me')).data,
  register: async (email: string, password: string, full_name?: string): Promise<User> =>
    demoMode ? demoApi.auth.register() :
    (await api.post<User>('/auth/register', { email, password, full_name })).data,
}

export const dashboardApi = {
  get: async (): Promise<DashboardData> =>
    demoMode ? demoApi.dashboard.get() : (await api.get<DashboardData>('/dashboard/')).data,
}

export const sitesApi = {
  list: async (): Promise<Site[]> => demoMode ? demoApi.sites.list() : (await api.get<Site[]>('/sites/')).data,
  get: async (id: string): Promise<Site> => demoMode ? demoApi.sites.get(id) : (await api.get<Site>(`/sites/${id}`)).data,
  create: async (data: Partial<Site>): Promise<Site> => demoMode ? demoApi.sites.create(data) : (await api.post<Site>('/sites/', data)).data,
  update: async (id: string, data: Partial<Site>): Promise<Site> =>
    demoMode ? demoApi.sites.update(id, data) :
    (await api.put<Site>(`/sites/${id}`, data)).data,
  delete: async (id: string): Promise<void> => { demoMode ? await demoApi.sites.delete() : await api.delete(`/sites/${id}`) },
}

export const devicesApi = {
  list: async (params?: {
    site_id?: string
    device_type?: DeviceType
    status?: DeviceStatus
    skip?: number
    limit?: number
  }): Promise<Device[]> =>
    demoMode ? demoApi.devices.list(params) : (await api.get<Device[]>('/devices/', { params })).data,

  get: async (id: string): Promise<DeviceDetail> =>
    demoMode ? demoApi.devices.get(id) :
    (await api.get<DeviceDetail>(`/devices/${id}`)).data,

  healthHistory: async (id: string): Promise<DeviceHealthHistory> =>
    demoMode ? demoApi.devices.healthHistory(id) :
    (await api.get<DeviceHealthHistory>(`/devices/${id}/health-history`)).data,

  create: async (data: Partial<Device>): Promise<Device> =>
    demoMode ? demoApi.devices.create(data) :
    (await api.post<Device>('/devices/', data)).data,

  update: async (id: string, data: Partial<Device>): Promise<Device> =>
    demoMode ? demoApi.devices.update(id, data) :
    (await api.put<Device>(`/devices/${id}`, data)).data,

  delete: async (id: string): Promise<void> => { demoMode ? await demoApi.devices.delete() : await api.delete(`/devices/${id}`) },

  triggerCheck: async (id: string): Promise<{ message: string }> =>
    demoMode ? demoApi.devices.triggerCheck() :
    (await api.post(`/devices/${id}/trigger-check`)).data,

  importCsv: async (file: File): Promise<ImportLog> => {
    if (demoMode) return demoApi.devices.importCsv(file)
    const form = new FormData()
    form.append('file', file)
    return (await api.post<ImportLog>('/devices/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })).data
  },

  importHistory: async (): Promise<ImportLog[]> =>
    demoMode ? demoApi.devices.importHistory() :
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
  }): Promise<Alert[]> => demoMode ? demoApi.alerts.list() : (await api.get<Alert[]>('/alerts/', { params })).data,

  acknowledge: async (id: string): Promise<Alert> =>
    demoMode ? demoApi.alerts.acknowledge(id) :
    (await api.post<Alert>(`/alerts/${id}/acknowledge`)).data,

  recover: async (id: string): Promise<Alert> =>
    demoMode ? demoApi.alerts.recover(id) :
    (await api.post<Alert>(`/alerts/${id}/recover`)).data,

  resolve: async (id: string, force = false): Promise<Alert> =>
    demoMode ? demoApi.alerts.resolve(id) :
    (await api.post<Alert>(`/alerts/${id}/resolve`, null, { params: force ? { force: true } : undefined })).data,

  summary: async (): Promise<{ open: number; acknowledged: number; critical_open: number }> =>
    demoMode ? demoApi.alerts.summary() :
    (await api.get('/alerts/summary')).data,

  history: async (id: string): Promise<AlertHistoryResponse> =>
    demoMode ? demoApi.alerts.history(id) :
    (await api.get<AlertHistoryResponse>(`/alerts/${id}/history`)).data,
}

export const reportsApi = {
  uptime: async (period: 'daily' | 'weekly' | 'monthly'): Promise<UptimeReport> =>
    demoMode ? demoApi.reports.uptime(period) :
    (await api.get<UptimeReport>('/reports/uptime', { params: { period } })).data,
  siteUptime: async (period: 'daily' | 'weekly' | 'monthly'): Promise<SiteUptimeReport> =>
    demoMode ? demoApi.reports.siteUptime(period) :
    (await api.get<SiteUptimeReport>('/reports/uptime/sites', { params: { period } })).data,
}

export const discoveryApi = {
  discover: async (ip: string, device_id?: string) =>
    (await api.post('/discovery/discover', null, { params: { ip_address: ip, device_id } })).data,
  scanSubnet: async (subnet: string) =>
    (await api.post('/discovery/scan-subnet', null, { params: { subnet } })).data,
}
