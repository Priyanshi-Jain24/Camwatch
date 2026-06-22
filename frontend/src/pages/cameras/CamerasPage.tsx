import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { devicesApi, sitesApi } from '@/api'
import { formatDate, formatDowntime, cn, formatLatencyWithLoss } from '@/utils'
import { StatusDot, StatusBadge, PageHeader, Spinner, EmptyState } from '@/components/shared'
import { Plus, Search, RefreshCw, Zap } from 'lucide-react'
import CameraFormModal from './CameraFormModal'

export default function CamerasPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)

  const { data: cameras = [], isLoading, refetch } = useQuery({
    queryKey: ['cameras'],
    queryFn: () => devicesApi.list({ device_type: 'camera', limit: 500 }),
    refetchInterval: 30_000,
  })
  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: sitesApi.list })

  const checkMut = useMutation({
    mutationFn: (id: string) => devicesApi.triggerCheck(id),
    onSuccess: () => { setTimeout(() => qc.invalidateQueries({ queryKey: ['cameras'] }), 2000) },
  })

  const filtered = cameras.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) &&
        !c.ip_address.includes(search) && !c.site_name?.toLowerCase().includes(search.toLowerCase())) return false
    if (siteFilter && c.site_id !== siteFilter) return false
    if (statusFilter === 'online' && c.status !== 'online' && c.status !== 'degraded') return false
    if (statusFilter && statusFilter !== 'online' && c.status !== statusFilter) return false
    return true
  })

  return (
    <div className="p-6">
      <PageHeader
        title={`Cameras (${cameras.length})`}
        actions={
          <>
            <button onClick={() => refetch()} className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5">
              <RefreshCw size={12} />
            </button>
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5">
              <Plus size={13} /> Add Camera
            </button>
          </>
        }
      />

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-8 text-xs"
            placeholder="Search name, IP, site..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="select text-xs" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
          <option value="">All Sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="select text-xs" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>

      {isLoading ? <Spinner /> : (
        <>
          {filtered.length === 0 ? <EmptyState message="No cameras found" /> : (
            <div className="overflow-x-auto table-scroll">
              <table className="w-full min-w-[1050px] text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Status', 'Name', 'Site', 'IP Address', 'Vendor / Model', 'Latency', 'Last Seen', 'Downtime', ''].map(h => (
                      <th key={h} className="text-left text-[11px] text-muted font-medium pb-2.5 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(cam => (
                    <tr key={cam.id} className="border-b border-border/50 hover:bg-surface/50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <StatusDot status={cam.status} />
                          <StatusBadge status={cam.status} />
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <Link to={`/cameras/${cam.id}`} className="text-accent hover:underline font-medium text-[13px]">
                          {cam.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-muted text-[12px]">{cam.site_name || '-'}</td>
                      <td className="py-3 pr-4 font-mono text-[12px] text-text">{cam.ip_address}</td>
                      <td className="py-3 pr-4 text-[12px] text-muted">
                        {cam.vendor ? `${cam.vendor}${cam.model ? ' / ' + cam.model : ''}` : '-'}
                      </td>
                      <td className="py-3 pr-4 text-[12px] text-muted font-mono">
                        {formatLatencyWithLoss(cam.latest_ping_latency_ms, cam.latest_ping_packet_loss_pct)}
                      </td>
                      <td className="py-3 pr-4 text-[12px] text-muted whitespace-nowrap min-w-[150px]">
                        {cam.last_seen ? formatDate(cam.last_seen) : '-'}
                      </td>
                      <td className="py-3 pr-4 text-[12px]">
                        {cam.downtime_seconds > 0
                          ? <span className="text-danger">{formatDowntime(cam.downtime_seconds)}</span>
                          : <span className="text-muted">-</span>
                        }
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => checkMut.mutate(cam.id)}
                          disabled={checkMut.isPending}
                          className="btn-ghost text-[11px] py-1 px-2 flex items-center gap-1"
                          title="Trigger check"
                        >
                          <Zap size={10} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showForm && (
        <CameraFormModal
          sites={sites}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['cameras'] }) }}
        />
      )}
    </div>
  )
}
