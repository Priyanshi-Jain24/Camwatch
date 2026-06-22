import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Clock, Eye, History, MessageCircle, RefreshCw, UserCheck, Users } from 'lucide-react'

import { alertsApi, sitesApi } from '@/api'
import { EmptyState, Modal, PageHeader, Panel, Spinner } from '@/components/shared'
import { useAuthStore } from '@/store/auth'
import type { Alert, AlertHistoryResponse, AlertState, AlertType, DeviceType } from '@/types'
import { cn, formatDate, formatDateShort, formatDowntime } from '@/utils'
import { isAdminUser } from '@/utils/permissions'

type ViewFilter = 'all' | AlertState

const ALERT_TYPES: AlertType[] = [
  'camera_offline',
  'ping_failure',
  'rtsp_failure',
  'nvr_offline',
  'api_failure',
  'nvr_ping_failure',
  'nvr_http_failure',
  'nvr_rtsp_failure',
  'nvr_recording_failure',
]

function alertStatus(alert: Alert): AlertState {
  return (alert.status || alert.state) as AlertState
}

function alertTypeLabel(alertType: AlertType): string {
  return alertType.replace(/_/g, ' ')
}

function compactSiteName(siteName?: string | null): string {
  const value = (siteName || '').trim()
  if (!value) return '-'

  return value
    .replace(/^cars24\s+hub,\s*/i, '')
    .replace(/^cars24\s+/i, '')
    .replace(/^cec\s+cars24\s+hub,\s*/i, '')
    .replace(/^parking\s+cars24\s+hub,\s*/i, '')
    .replace(/^cec\s+and\s+parking,\s+cars24,\s*/i, '')
    .replace(/^parking,\s+cars24,\s*/i, '')
    .trim() || value
}

function listIssueLabel(alert: Alert): string {
  if (alert.alert_type === 'nvr_rtsp_failure' || alert.alert_type === 'rtsp_failure') {
    return 'RTSP failure'
  }
  if (alert.alert_type === 'nvr_http_failure' || alert.alert_type === 'api_failure') {
    return 'HTTP/API failure'
  }
  if (alert.alert_type === 'nvr_ping_failure' || alert.alert_type === 'ping_failure') {
    return 'Ping failure'
  }
  if (alert.alert_type === 'nvr_recording_failure') {
    return 'Recording failure'
  }
  return alert.title || alert.description || alertTypeLabel(alert.alert_type)
}

function ageFrom(iso: string) {
  return formatDowntime(Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000)))
}

function currentDeviceState(status: AlertState) {
  if (status === 'recovered' || status === 'resolved') {
    return {
      label: 'Back online',
      detail: status === 'resolved' ? 'Recovered and closed by operator' : 'Recovered automatically, waiting for closure',
      badgeClass: 'badge-online',
    }
  }

  return {
    label: 'Offline now',
    detail: status === 'acknowledged' ? 'Someone has seen it and is working on it' : 'Needs operator attention',
    badgeClass: 'badge-offline',
  }
}

function operatorState(status: AlertState) {
  switch (status) {
    case 'open':
      return { label: 'New', detail: 'Nobody has acknowledged this yet', badgeClass: 'badge-open' }
    case 'acknowledged':
      return { label: 'Acknowledged', detail: 'Seen by an operator, still active', badgeClass: 'badge-acknowledged' }
    case 'recovered':
      return { label: 'Waiting closure', detail: 'Recovered automatically, needs Resolve', badgeClass: 'badge-online' }
    case 'resolved':
      return { label: 'Closed', detail: 'Finished and kept for history', badgeClass: 'badge-resolved' }
  }
}

function notificationLevel(alert: Alert, history?: AlertHistoryResponse) {
  const notifications = history?.notifications ?? []
  const escalationLogged = Boolean(
    alert.escalated_at || history?.history?.some(h => h.note?.toLowerCase().includes('escalated')),
  )

  if (escalationLogged) {
    return {
      label: 'Manager notified',
      detail: 'Regional Head and Regional Manager',
      icon: Users,
      className: 'text-warning',
    }
  }
  if (notifications.length > 0) {
    return {
      label: 'Head notified',
      detail: 'Regional Head',
      icon: UserCheck,
      className: 'text-success',
    }
  }
  return {
    label: 'No notification logged',
    detail: 'No recipient recorded yet',
    icon: MessageCircle,
    className: 'text-muted',
  }
}

function statusPriority(status: AlertState): number {
  switch (status) {
    case 'open':
      return 0
    case 'acknowledged':
      return 1
    case 'recovered':
      return 2
    case 'resolved':
      return 3
  }
}

function sortAlerts(items: Alert[]) {
  return [...items].sort((a, b) => {
    const aStatus = alertStatus(a)
    const bStatus = alertStatus(b)
    const statusDiff = statusPriority(aStatus) - statusPriority(bStatus)
    if (statusDiff !== 0) return statusDiff

    const createdDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (createdDiff !== 0) return createdDiff

    const aRank = a.device_type === 'nvr' ? 0 : 1
    const bRank = b.device_type === 'nvr' ? 0 : 1
    if (aRank !== bRank) return aRank - bRank

    if (aStatus === 'resolved' && bStatus === 'resolved') {
      return new Date(b.resolved_at || b.created_at).getTime() - new Date(a.resolved_at || a.created_at).getTime()
    }

    const siteDiff = (a.site_name || '').localeCompare(b.site_name || '')
    if (siteDiff !== 0) return siteDiff

    return (b.occurrence_count || 1) - (a.occurrence_count || 1)
  })
}

function AlertDetail({
  alert,
  data,
  onClose,
  onAcknowledge,
  onResolve,
  actionBusy,
  canManage,
}: {
  alert: Alert
  data?: AlertHistoryResponse
  onClose: () => void
  onAcknowledge: () => void
  onResolve: () => void
  actionBusy: boolean
  canManage: boolean
}) {
  const status = alertStatus(alert)
  const level = notificationLevel(alert, data)
  const deviceState = currentDeviceState(status)
  const workflow = operatorState(status)
  const LevelIcon = level.icon

  return (
    <Modal title="Alert Details" onClose={onClose} width="max-w-4xl">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={deviceState.badgeClass}>{deviceState.label}</span>
              <span className={workflow.badgeClass}>{workflow.label}</span>
              <span className={alert.device_type === 'nvr' ? 'badge-nvr' : 'badge-camera'}>
                {(alert.device_type || 'camera').toUpperCase()}
              </span>
            </div>
            <div className="text-base font-semibold text-text">{alert.device_name || alert.title}</div>
            <div className="text-sm text-muted">
              {alert.site_name || '-'} · {alertTypeLabel(alert.alert_type)}
            </div>
          </div>
          <div className="text-right text-[12px] text-muted">
            <div>Created {formatDate(alert.created_at)}</div>
            <div>Age {ageFrom(alert.created_at)}</div>
            <div>Occurrences {alert.occurrence_count ?? 1}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="label">Device Status Now</div>
            <div className="text-sm font-semibold text-text">{deviceState.label}</div>
            <div className="text-[12px] text-muted mt-1">{deviceState.detail}</div>
          </div>
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="label">Alert Workflow</div>
            <div className="text-sm font-semibold text-text">{workflow.label}</div>
            <div className="text-[12px] text-muted mt-1">{workflow.detail}</div>
          </div>
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="label">Notification Level</div>
            <div className={cn('flex items-center gap-2 font-semibold text-sm', level.className)}>
              <LevelIcon size={15} /> {level.label}
            </div>
            <div className="text-[12px] text-muted mt-1">{level.detail}</div>
          </div>
          <div className="bg-surface2 border border-border rounded p-3">
            <div className="label">Last Failure Seen</div>
            <div className="text-sm text-text">{alert.last_seen_at ? formatDate(alert.last_seen_at) : '-'}</div>
            <div className="text-[12px] text-muted mt-1">Latest detection of this issue</div>
          </div>
        </div>

        <div>
          <div className="label">Issue</div>
          <div className="text-sm text-text bg-surface2 border border-border rounded p-3">
            {alert.description || alert.title}
          </div>
        </div>

        {alert.message && (
          <div>
            <div className="label">Alert Message</div>
            <pre className="text-[12px] whitespace-pre-wrap text-text bg-surface2 border border-border rounded p-3 max-h-48 overflow-auto">
              {alert.message}
            </pre>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="label flex items-center gap-1"><History size={12} /> Timeline</div>
            {(data?.history ?? []).length === 0 ? (
              <div className="text-sm text-muted">No history entries</div>
            ) : (
              <div className="max-h-[320px] overflow-y-auto pr-1">
                {data!.history.map(h => (
                  <div key={h.id} className="border-b border-border py-2 text-[12px]">
                    <span className="text-muted">{formatDate(h.created_at)}</span>
                    <span className="mx-2">{h.from_status || 'new'} {'->'} {h.to_status}</span>
                    {h.note && <span className="text-muted">{h.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="label flex items-center gap-1"><MessageCircle size={12} /> Notifications</div>
            {(data?.notifications ?? []).length === 0 ? (
              <div className="text-sm text-muted">No notifications logged</div>
            ) : data!.notifications.map(n => (
              <div key={n.id} className="bg-surface2 border border-border rounded p-3 mb-2">
                <div className="text-[11px] text-muted mb-1">
                  {formatDate(n.sent_at)} · {n.channel} · {n.recipient} · {n.status}
                </div>
                <pre className="text-[11px] whitespace-pre-wrap text-text max-h-28 overflow-auto">{n.message}</pre>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between gap-2 pt-2 border-t border-border">
          <button className="btn-ghost" onClick={onClose}>Close</button>
          <div className="flex items-center gap-2">
            {!canManage && (
              <span className="text-[12px] text-muted px-2">Read-only access. Admin actions are hidden for this role.</span>
            )}
            {canManage && status === 'open' && (
              <button onClick={onAcknowledge} disabled={actionBusy} className="btn-ghost">
                <Eye size={13} /> Acknowledge
              </button>
            )}
            {canManage && status === 'acknowledged' && (
              <span className="text-[12px] text-muted px-2">Still offline. Waiting for recovery before closure.</span>
            )}
            {canManage && status === 'recovered' && (
              <button onClick={onResolve} disabled={actionBusy} className="btn-success">
                <CheckCircle size={13} /> Resolve
              </button>
            )}
            {canManage && status === 'resolved' && (
              <span className="text-[12px] text-muted px-2">Closed alert kept for history.</span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function AlertRow({ alert, onOpen }: { alert: Alert; onOpen: (alert: Alert) => void }) {
  const status = alertStatus(alert)
  const level = notificationLevel(alert)
  const deviceState = currentDeviceState(status)
  const workflow = operatorState(status)
  const LevelIcon = level.icon

  return (
    <button
      type="button"
      onClick={() => onOpen(alert)}
      className="w-full text-left border-b border-border last:border-b-0 px-4 py-2.5 hover:bg-surface2/80 transition-colors"
    >
      <div className="grid w-full grid-cols-[minmax(220px,2fr)_minmax(140px,1fr)_minmax(140px,0.95fr)_minmax(160px,1fr)_135px] gap-4 items-center">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-text truncate">{compactSiteName(alert.site_name)}</div>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-muted min-w-0">
            <span className={alert.device_type === 'nvr' ? 'badge-nvr' : 'badge-camera'}>
              {(alert.device_type || 'camera').toUpperCase()}
            </span>
            <span className="badge-unknown">{alertTypeLabel(alert.alert_type)}</span>
            <span className="truncate">{alert.device_name || '-'}</span>
          </div>
        </div>

        <div className="min-w-0">
          <span className={workflow.badgeClass}>{workflow.label}</span>
          <div className="text-[12px] text-muted mt-1 truncate">{deviceState.label}</div>
        </div>

        <div className="min-w-0">
          <div className="text-[14px] text-text whitespace-nowrap overflow-hidden text-ellipsis">{listIssueLabel(alert)}</div>
        </div>

        <div className="min-w-0">
          <div className={cn('inline-flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap overflow-hidden text-ellipsis', level.className)}>
            <LevelIcon size={12} /> {level.label}
          </div>
        </div>

        <div className="min-w-0 leading-tight">
          <div className="text-[13px] text-text whitespace-nowrap">{alert.last_seen_at ? formatDateShort(alert.last_seen_at) : '-'}</div>
          <div className="mt-1 text-[12px] text-muted whitespace-nowrap"><Clock size={10} className="inline mr-1" />{ageFrom(alert.created_at)}</div>
        </div>
      </div>
    </button>
  )
}

export default function AlertsPage() {
  const qc = useQueryClient()
  const user = useAuthStore(state => state.user)
  const canManage = isAdminUser(user)
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all')
  const [typeFilter, setTypeFilter] = useState<AlertType | ''>('')
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<DeviceType | ''>('')
  const [siteFilter, setSiteFilter] = useState('')
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)

  const { data: alerts = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['alerts', viewFilter, typeFilter, deviceTypeFilter, siteFilter],
    queryFn: () => alertsApi.list({
      include_resolved: false,
      alert_type: typeFilter || undefined,
      device_type: deviceTypeFilter || undefined,
      site_id: siteFilter || undefined,
    }),
    refetchInterval: 20_000,
  })

  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: sitesApi.list })
  const { data: detailData } = useQuery({
    queryKey: ['alert-history', selectedAlert?.id],
    queryFn: () => alertsApi.history(selectedAlert!.id),
    enabled: !!selectedAlert,
  })

  const closeDetail = () => setSelectedAlert(null)
  const refreshAfterAction = () => {
    qc.invalidateQueries({ queryKey: ['alerts'] })
    if (selectedAlert) qc.invalidateQueries({ queryKey: ['alert-history', selectedAlert.id] })
  }

  const ackMut = useMutation({
    mutationFn: (id: string) => alertsApi.acknowledge(id),
    onSuccess: alert => {
      setSelectedAlert(alert)
      refreshAfterAction()
    },
  })

  const resMut = useMutation({
    mutationFn: (id: string) => alertsApi.resolve(id),
    onSuccess: alert => {
      setSelectedAlert(alert)
      refreshAfterAction()
    },
  })

  const counts = useMemo(() => ({
    open: alerts.filter(a => alertStatus(a) === 'open').length,
    acknowledged: alerts.filter(a => alertStatus(a) === 'acknowledged').length,
    recovered: alerts.filter(a => alertStatus(a) === 'recovered').length,
  }), [alerts])

  const filteredAlerts = useMemo(() => {
    const visible = viewFilter === 'all'
      ? alerts
      : alerts.filter(alert => alertStatus(alert) === viewFilter)
    return sortAlerts(visible)
  }, [alerts, viewFilter])

  return (
    <div className="p-6">
      <PageHeader
        title="Alerts"
        subtitle="Compact alert list with status, site, device, notification level, and age."
        actions={
          <button onClick={() => refetch()} className="btn-ghost text-xs py-1.5 px-3">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[
          { key: 'all', label: 'All', count: alerts.length, className: 'text-text' },
          { key: 'open', label: 'Open', count: counts.open, className: 'text-danger' },
          { key: 'acknowledged', label: 'Acknowledged', count: counts.acknowledged, className: 'text-warning' },
          { key: 'recovered', label: 'Recovered', count: counts.recovered, className: 'text-success' },
        ].map(tab => {
          const active = viewFilter === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setViewFilter(tab.key as ViewFilter)}
              className={cn(
                'rounded border px-3 py-1.5 text-xs font-medium transition-colors',
                active ? 'border-border2 bg-surface2 text-text' : 'border-border text-muted hover:text-text hover:border-border2',
              )}
            >
              <span>{tab.label}</span>
              <span className={cn('ml-2 tabular-nums', tab.className)}>{tab.count}</span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <select className="select text-xs py-1.5" value={typeFilter} onChange={e => setTypeFilter(e.target.value as AlertType | '')}>
          <option value="">All Alert Types</option>
          {ALERT_TYPES.map(t => <option key={t} value={t}>{alertTypeLabel(t)}</option>)}
        </select>
        <select className="select text-xs py-1.5" value={deviceTypeFilter} onChange={e => setDeviceTypeFilter(e.target.value as DeviceType | '')}>
          <option value="">All Device Types</option>
          <option value="camera">Camera</option>
          <option value="nvr">NVR</option>
        </select>
        <select className="select text-xs py-1.5" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
          <option value="">All Sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isLoading ? <Spinner /> : filteredAlerts.length === 0 ? (
        <EmptyState message="No alerts match your filters" icon={<CheckCircle size={32} className="text-success" />} />
      ) : (
        <Panel title="Alert List" count={filteredAlerts.length} className="overflow-hidden">
          <div>
            <div className="bg-surface2 border-y border-border px-4 py-3">
              <div className="grid w-full grid-cols-[minmax(220px,2fr)_minmax(140px,1fr)_minmax(140px,0.95fr)_minmax(160px,1fr)_135px] gap-4 text-[11px] uppercase tracking-wide text-muted">
                <div>Site</div>
                <div>Status</div>
                <div>Issue</div>
                <div>Notification</div>
                <div>Timing</div>
              </div>
            </div>
            <div className="px-4">
              {filteredAlerts.map(alert => (
                <AlertRow key={alert.id} alert={alert} onOpen={setSelectedAlert} />
              ))}
            </div>
          </div>
        </Panel>
      )}

      {selectedAlert && (
        <AlertDetail
          alert={selectedAlert}
          data={detailData}
          onClose={closeDetail}
          onAcknowledge={() => ackMut.mutate(selectedAlert.id)}
          onResolve={() => resMut.mutate(selectedAlert.id)}
          actionBusy={ackMut.isPending || resMut.isPending}
          canManage={canManage}
        />
      )}
    </div>
  )
}
