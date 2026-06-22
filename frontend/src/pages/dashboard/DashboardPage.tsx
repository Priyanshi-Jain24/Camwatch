import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { dashboardApi } from '@/api'
import { formatDate, formatDowntime, cn } from '@/utils'
import { Spinner, ProgressBar, Panel } from '@/components/shared'
import type { Alert, Device, SiteStatus } from '@/types'
import {
  Camera, Server, RefreshCw, AlertTriangle, CheckCircle,
  Bell, Wifi, WifiOff, Activity, MapPin,
} from 'lucide-react'

function KpiCard({
  label, value, sub, color, icon,
}: {
  label: string
  value: number
  sub?: string
  color: string
  icon: React.ReactNode
}) {
  return (
    <div className="card py-4 px-5 flex items-start justify-between gap-3 hover:border-border2 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted mb-2 font-medium">{label}</div>
        <div className={cn('text-[26px] font-bold tabular-nums leading-none', color)}>{value}</div>
        {sub && <div className="text-[10px] text-muted mt-1.5">{sub}</div>}
      </div>
      <div className={cn(
        'p-2 rounded-lg mt-0.5',
        color === 'text-success' ? 'bg-success/10' :
        color === 'text-danger' ? 'bg-danger/10' :
        color === 'text-warning' ? 'bg-warning/10' :
        color === 'text-purple' ? 'bg-purple/10' : 'bg-accent/10',
      )}>
        <span className={color}>{icon}</span>
      </div>
    </div>
  )
}

function SiteHealthRow({ site }: { site: SiteStatus }) {
  const pct = site.uptime_percent
  const reachableDevices = site.online_devices + (site.degraded_devices || 0)
  const col = pct >= 90 ? 'text-success' : pct >= 60 ? 'text-warning' : 'text-danger'

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between text-[12px] mb-1.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin size={10} className="text-muted shrink-0" />
          <span className="text-text truncate">{site.site_name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-muted text-[11px]">{reachableDevices}/{site.total_devices}</span>
          <span className={cn('font-semibold w-9 text-right tabular-nums', col)}>{pct}%</span>
        </div>
      </div>
      <ProgressBar value={reachableDevices} max={site.total_devices} />
      {site.offline_devices > 0 && (
        <div className="text-[10px] text-danger mt-1">
          {site.offline_devices} device{site.offline_devices > 1 ? 's' : ''} offline
        </div>
      )}
    </div>
  )
}

function AlertItem({ alert }: { alert: Alert }) {
  const borderCol =
    alert.severity === 'critical' ? 'border-l-danger' :
    alert.severity === 'high' ? 'border-l-warning' : 'border-l-muted'
  const sevCol =
    alert.severity === 'critical' ? 'text-danger' :
    alert.severity === 'high' ? 'text-warning' : 'text-muted'

  return (
    <div className={cn('px-3 py-2.5 bg-surface2 rounded border-l-2 mb-2 last:mb-0', borderCol)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] text-text font-medium truncate">{alert.title}</div>
          <div className="text-[10px] text-muted mt-0.5">
            {alert.device_name && <span>{alert.device_name} · </span>}
            {alert.site_name && <span>{alert.site_name} · </span>}
            {formatDate(alert.created_at)}
          </div>
        </div>
        <span className={cn('text-[10px] font-semibold shrink-0 mt-0.5 capitalize', sevCol)}>
          {alert.severity}
        </span>
      </div>
    </div>
  )
}

function OfflineCard({ device, isCritical }: { device: Device; isCritical?: boolean }) {
  return (
    <div className={cn(
      'bg-surface2 rounded-lg p-3 border mb-2 last:mb-0',
      isCritical ? 'border-danger/25' : 'border-danger/15',
    )}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <WifiOff size={12} className="text-danger shrink-0" />
          <span className="text-[13px] font-medium text-text truncate">{device.name}</span>
        </div>
        <span className="badge-offline shrink-0">Offline</span>
      </div>
      <div className="text-[11px] text-muted">
        {device.site_name && <span>{device.site_name} · </span>}
        <span className="font-mono">{device.ip_address}</span>
      </div>
      {device.downtime_seconds > 0 && (
        <div className="text-[11px] text-danger mt-1 flex items-center gap-1">
          <Activity size={9} />
          Down {formatDowntime(device.downtime_seconds)}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.get,
    refetchInterval: 30_000,
  })

  if (isLoading) return <div className="p-6"><Spinner /></div>

  const s = data?.stats
  const sites = data?.site_statuses ?? []
  const critAlerts = data?.critical_alerts ?? []
  const offlineCams = data?.offline_cameras ?? []
  const critNvrs = data?.critical_nvrs ?? []

  const onlineCameras = s?.online_cameras ?? 0
  const degradedCameras = s?.degraded_cameras ?? 0
  const reachableCameras = onlineCameras + degradedCameras
  const onlineNvrs = s?.online_nvrs ?? 0
  const degradedNvrs = s?.degraded_nvrs ?? 0
  const reachableNvrs = onlineNvrs + degradedNvrs
  const camPct = s && s.total_cameras > 0
    ? Math.round((reachableCameras / s.total_cameras) * 100)
    : 0
  const nvrPct = s && s.total_nvrs > 0
    ? Math.round((reachableNvrs / s.total_nvrs) * 100)
    : 0

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[16px] font-bold text-text">Overview</h1>
          <div className="text-[11px] text-muted mt-0.5">
            {dataUpdatedAt
              ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString('en-IN')}`
              : 'Loading...'}
          </div>
        </div>
        <button onClick={() => refetch()} className="btn-ghost text-xs py-1.5 px-3">
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted font-semibold uppercase tracking-widest mb-2.5">
          <Camera size={10} /> Cameras
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3">
          <KpiCard
            label="Total Cameras"
            value={s?.total_cameras ?? 0}
            color="text-accent"
            icon={<Camera size={18} />}
            sub={`${camPct}% availability`}
          />
          <KpiCard
            label="Online"
            value={reachableCameras}
            color="text-success"
            icon={<Wifi size={18} />}
            sub={degradedCameras > 0 ? `${degradedCameras} degraded` : 'Currently reachable'}
          />
          <KpiCard
            label="Offline"
            value={s?.offline_cameras ?? 0}
            color="text-danger"
            icon={<WifiOff size={18} />}
            sub={offlineCams.length > 0 ? `${offlineCams.length} need attention` : 'All clear'}
          />
          <KpiCard
            label="Degraded"
            value={degradedCameras}
            color="text-warning"
            icon={<Wifi size={18} />}
          />
          <KpiCard
            label="Standalone"
            value={s?.standalone_cameras ?? 0}
            color="text-teal"
            icon={<Camera size={18} />}
            sub="No NVR link"
          />
          <KpiCard
            label="NVR-linked"
            value={s?.nvr_linked_cameras ?? 0}
            color="text-purple"
            icon={<Server size={18} />}
            sub="Assigned to NVR"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted font-semibold uppercase tracking-widest mb-2.5">
          <Server size={10} /> NVRs
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3">
          <KpiCard
            label="Total NVRs"
            value={s?.total_nvrs ?? 0}
            color="text-purple"
            icon={<Server size={18} />}
            sub={`${nvrPct}% availability`}
          />
          <KpiCard
            label="Online"
            value={reachableNvrs}
            color="text-success"
            icon={<CheckCircle size={18} />}
            sub={degradedNvrs > 0 ? `${degradedNvrs} degraded` : undefined}
          />
          <KpiCard
            label="Offline"
            value={s?.offline_nvrs ?? 0}
            color="text-danger"
            icon={<WifiOff size={18} />}
          />
            <KpiCard
              label="Healthy"
              value={s?.healthy_nvrs ?? 0}
              color="text-success"
              icon={<CheckCircle size={18} />}
            />
            <KpiCard
              label="Degraded"
              value={degradedNvrs}
              color="text-warning"
              icon={<Wifi size={18} />}
            />
            <KpiCard
              label="Failed"
              value={s?.failed_nvrs ?? 0}
              color="text-danger"
              icon={<AlertTriangle size={18} />}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted font-semibold uppercase tracking-widest mb-2.5">
          <AlertTriangle size={10} /> Alerts
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <KpiCard
            label="Active Alerts"
            value={s?.active_alerts ?? 0}
            color="text-warning"
            icon={<Bell size={18} />}
            sub="Open, acknowledged, recovered"
          />
          <KpiCard
            label="Critical"
            value={s?.critical_alerts ?? 0}
            color="text-danger"
            icon={<AlertTriangle size={18} />}
            sub="Immediate action needed"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel title="Site Health Summary" count={sites.length}>
          <div className="max-h-[280px] overflow-y-auto pr-1">
            {sites.length === 0
              ? <div className="text-muted text-sm py-4 text-center">No sites configured</div>
              : sites.map(site => <SiteHealthRow key={site.site_id} site={site} />)}
          </div>
        </Panel>
        <Panel
          title="Recent Alerts"
          count={critAlerts.length}
          action={<Link to="/alerts" className="text-[10px] text-accent hover:underline">View all →</Link>}
        >
          <div className="max-h-[280px] overflow-y-auto">
            {critAlerts.length === 0
              ? (
                <div className="py-6 text-center">
                  <CheckCircle size={22} className="text-success mx-auto mb-2 opacity-50" />
                  <div className="text-success text-sm">No active alerts</div>
                </div>
                )
              : critAlerts.map(alert => <AlertItem key={alert.id} alert={alert} />)}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel
          title="Offline Cameras"
          count={offlineCams.length}
          action={offlineCams.length > 0
            ? <Link to="/sites" className="text-[10px] text-accent hover:underline">Manage →</Link>
            : undefined}
        >
          {offlineCams.length === 0
            ? (
              <div className="py-6 text-center">
                <Wifi size={22} className="text-success mx-auto mb-2 opacity-50" />
                <div className="text-success text-sm">All cameras online</div>
              </div>
              )
            : (
              <div className="max-h-[280px] overflow-y-auto">
                {offlineCams.map(device => <OfflineCard key={device.id} device={device} />)}
              </div>
              )}
        </Panel>
        <Panel
          title="Critical NVRs"
          count={critNvrs.length}
          action={critNvrs.length > 0
            ? <Link to="/sites" className="text-[10px] text-accent hover:underline">Manage →</Link>
            : undefined}
        >
          {critNvrs.length === 0
            ? (
              <div className="py-6 text-center">
                <Server size={22} className="text-success mx-auto mb-2 opacity-50" />
                <div className="text-success text-sm">All NVRs operational</div>
              </div>
              )
            : (
              <div className="max-h-[280px] overflow-y-auto">
                {critNvrs.map(device => <OfflineCard key={device.id} device={device} isCritical />)}
              </div>
              )}
        </Panel>
      </div>
    </div>
  )
}
