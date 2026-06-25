import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { devicesApi } from '@/api'
import { formatDate, formatDowntime, formatLatencyWithLoss } from '@/utils'
import { Spinner, EmptyState, PageHeader, StatusDot, StatusBadge, DeviceTypeBadge } from '@/components/shared'
import { Search, MonitorPlay, ArrowLeft } from 'lucide-react'
import type { Device } from '@/types'

// "online" intentionally includes degraded so the count matches the dashboard's
// "Online" card (which counts reachable = online + degraded). A separate
// "degraded" filter narrows to just degraded devices.
function matchesStatus(device: Device, status: string): boolean {
  if (!status) return true
  if (status === 'online') return device.status === 'online' || device.status === 'degraded'
  return device.status === status
}

export default function DevicesPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const type = params.get('type') ?? ''       // '' | 'camera' | 'nvr'
  const status = params.get('status') ?? ''    // '' | 'online' | 'offline' | 'degraded' | 'unknown'
  const search = params.get('q') ?? ''

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices', 'all'],
    queryFn: () => devicesApi.list({ limit: 1000 }),
    refetchInterval: 30_000,
  })

  // Update a single query param while preserving the others (keeps URL shareable).
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return devices.filter(d => {
      if (type && d.device_type !== type) return false
      if (!matchesStatus(d, status)) return false
      if (q) {
        const hay = [d.name, d.ip_address, d.site_name, d.nvr_name].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [devices, type, status, search])

  const typeLabel = type === 'camera' ? 'Cameras' : type === 'nvr' ? 'NVRs' : 'Devices'
  const statusLabel = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'All'
  const subtitle = `${filtered.length} ${statusLabel.toLowerCase()} ${typeLabel.toLowerCase()}`

  return (
    <div className="p-6">
      <button
        onClick={() => navigate('/')}
        className="btn-ghost text-xs py-1.5 px-2 mb-3"
      >
        <ArrowLeft size={13} /> Back to Dashboard
      </button>
      <PageHeader
        title={`${statusLabel} ${typeLabel}`}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input pl-7 text-xs py-1.5 w-44"
                placeholder="Search name, IP…"
                value={search}
                onChange={e => setParam('q', e.target.value)}
              />
            </div>
            <select className="select text-xs py-1.5" value={type} onChange={e => setParam('type', e.target.value)}>
              <option value="">All Types</option>
              <option value="camera">Cameras</option>
              <option value="nvr">NVRs</option>
            </select>
            <select className="select text-xs py-1.5" value={status} onChange={e => setParam('status', e.target.value)}>
              <option value="">All Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="degraded">Degraded</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        }
      />

      {isLoading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState message="No devices match these filters." icon={<MonitorPlay size={28} />} />
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted uppercase tracking-wider border-b border-border">
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">IP Address</th>
                <th className="px-4 py-2.5 font-medium">Site</th>
                <th className="px-4 py-2.5 font-medium">Latency</th>
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(dev => (
                <tr key={dev.id} className="table-row border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusDot status={dev.status} />
                      <StatusBadge status={dev.status} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-medium">
                    <Link to={`/devices/${dev.id}`} className="hover:text-accent transition-colors">
                      {dev.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5"><DeviceTypeBadge type={dev.device_type} /></td>
                  <td className="px-4 py-2.5 font-mono text-[12px]">{dev.ip_address}</td>
                  <td className="px-4 py-2.5 text-muted text-[12px]">
                    {dev.site_name || '—'}
                    {dev.nvr_name && <span className="text-[10px] text-muted/70"> · {dev.nvr_name}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted text-[12px] font-mono whitespace-nowrap">
                    {formatLatencyWithLoss(dev.latest_ping_latency_ms, dev.latest_ping_packet_loss_pct)}
                  </td>
                  <td className="px-4 py-2.5 text-muted text-[12px] whitespace-nowrap">
                    {dev.last_seen ? formatDate(dev.last_seen) : '—'}
                    {dev.status === 'offline' && dev.downtime_seconds > 0 && (
                      <div className="text-[10px] text-danger mt-0.5">Down {formatDowntime(dev.downtime_seconds)}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
        <Link to="/sites" className="text-[11px] text-accent hover:underline">Manage in Sites →</Link>
      </div>
    </div>
  )
}
