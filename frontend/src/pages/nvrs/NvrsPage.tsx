import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { devicesApi, sitesApi } from '@/api'
import { apiErrorMessage, formatDate, formatDowntime, formatLatencyWithLoss, generateRtspUrl, pingStateLabel, severityBadgeClass } from '@/utils'
import { StatusDot, StatusBadge, PageHeader, Spinner, EmptyState } from '@/components/shared'
import { Plus, Search, Zap, X, ArrowLeft, Pencil, RefreshCw, Eye, EyeOff, AlertTriangle } from 'lucide-react'

function NvrFormModal({ sites, nvr, onClose, onSaved }: any) {
  const isEdit = !!nvr
  const [form, setForm] = useState({
    name: nvr?.name ?? '',
    site_id: nvr?.site_id ?? (sites[0]?.id ?? ''),
    ip_address: nvr?.ip_address ?? '',
    port: nvr?.port ?? 80,
    rtsp_port: nvr?.rtsp_port ?? 554,
    username: nvr?.username ?? '',
    password: nvr?.password ?? '',
    rtsp_mode: nvr?.rtsp_mode ?? 'auto',
    rtsp_stream_type: nvr?.rtsp_stream_type ?? 'main',
    rtsp_url: nvr?.rtsp_url ?? '',
    vendor: nvr?.vendor ?? '',
    model: nvr?.model ?? '',
    serial_number: nvr?.serial_number ?? '',
    firmware_version: nvr?.firmware_version ?? '',
    notes: nvr?.notes ?? '',
  })
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const generatedRtspUrl = generateRtspUrl(
    form.vendor,
    form.ip_address,
    form.rtsp_port,
    form.username,
    form.password,
    form.rtsp_stream_type,
    'nvr',
  )

  const save = () => {
    if (!String(form.name).trim()) {
      setError('NVR name is required')
      return
    }
    if (!String(form.ip_address).trim()) {
      setError('IP address is required')
      return
    }
    setError('')
    mut.mutate()
  }

  const mut = useMutation({
    mutationFn: isEdit
      ? () => devicesApi.update(nvr.id, { ...form, device_type: 'nvr' })
      : () => devicesApi.create({ ...form, device_type: 'nvr' }),
    onSuccess: onSaved,
    onError: (e: any) => setError(apiErrorMessage(e, 'Failed')),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">{isEdit ? 'Edit NVR' : 'Add NVR'}</h2>
          <button onClick={onClose}><X size={15} className="text-muted" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted block mb-1.5">Name *</label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Site *</label>
              <select className="select w-full" value={form.site_id} onChange={e => set('site_id', e.target.value)}>
                {sites.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">IP Address *</label>
              <input className="input font-mono" value={form.ip_address} onChange={e => set('ip_address', e.target.value)} placeholder="192.168.1.200" />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Port</label>
              <input className="input font-mono" type="number" value={form.port} onChange={e => set('port', +e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">RTSP Port</label>
              <input className="input font-mono" type="number" value={form.rtsp_port} onChange={e => set('rtsp_port', +e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Username</label>
              <input className="input" value={form.username} onChange={e => set('username', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Password</label>
              <div className="relative">
                <input
                  className="input pr-9"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Vendor</label>
              <select className="select w-full" value={form.vendor} onChange={e => set('vendor', e.target.value)}>
                <option value="">Select vendor</option>
                <option value="Hikvision">Hikvision</option>
                <option value="Dahua">Dahua</option>
                <option value="UNV">Uniview / UNV</option>
                <option value="CP Plus">CP Plus</option>
                <option value="Axis">Axis</option>
                <option value="Generic">Generic</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Stream Type</label>
              <select className="select w-full" value={form.rtsp_stream_type} onChange={e => set('rtsp_stream_type', e.target.value)}>
                <option value="main">Main Stream</option>
                <option value="sub">Sub Stream</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Model</label>
              <input className="input" value={form.model} onChange={e => set('model', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">RTSP URL</label>
            <input
              className="input font-mono text-xs"
              value={form.rtsp_url}
              onChange={e => set('rtsp_url', e.target.value)}
              placeholder={generatedRtspUrl || 'rtsp://192.168.1.200/stream1'}
            />
            {generatedRtspUrl && !form.rtsp_url && (
              <div className="text-[10px] text-muted mt-1">Auto: {generatedRtspUrl}</div>
            )}
          </div>
          {error && <div className="text-danger text-xs">{error}</div>}
          <div className="flex gap-3 justify-end">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={mut.isPending}>
              {mut.isPending ? 'Saving...' : isEdit ? 'Update' : 'Add NVR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function NvrsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)

  const { data: nvrs = [], isLoading, refetch } = useQuery({
    queryKey: ['nvrs'],
    queryFn: () => devicesApi.list({ device_type: 'nvr', limit: 500 }),
    refetchInterval: 30_000,
  })
  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: sitesApi.list })

  const checkMut = useMutation({
    mutationFn: (id: string) => devicesApi.triggerCheck(id),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['nvrs'] }), 2000),
  })

  const filtered = nvrs.filter(n =>
    !search ||
    n.name.toLowerCase().includes(search.toLowerCase()) ||
    n.ip_address.includes(search) ||
    n.site_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6">
      <PageHeader
        title={`NVRs (${nvrs.length})`}
        actions={
          <>
            <button onClick={() => refetch()} className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5">
              <RefreshCw size={12} />
            </button>
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5">
              <Plus size={13} /> Add NVR
            </button>
          </>
        }
      />

      <div className="mb-5 max-w-xs">
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-8 text-xs" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {isLoading ? <Spinner /> : filtered.length === 0 ? <EmptyState message="No NVRs found" /> : (
        <div className="overflow-x-auto table-scroll">
          <table className="w-full min-w-[1050px] text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Status', 'Name', 'Site', 'IP Address', 'Vendor / Model', 'Latency', 'API', 'Last Seen', ''].map(h => (
                  <th key={h} className="text-left text-[11px] text-muted font-medium pb-2.5 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(nvr => (
                <tr key={nvr.id} className="border-b border-border/50 hover:bg-surface/50 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <StatusDot status={nvr.status} />
                      <StatusBadge status={nvr.status} />
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <Link to={`/nvrs/${nvr.id}`} className="text-accent hover:underline font-medium text-[13px]">
                      {nvr.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-muted text-[12px]">{nvr.site_name || '-'}</td>
                  <td className="py-3 pr-4 font-mono text-[12px]">{nvr.ip_address}</td>
                  <td className="py-3 pr-4 text-[12px] text-muted whitespace-nowrap">
                    {nvr.vendor ? `${nvr.vendor}${nvr.model ? ' / ' + nvr.model : ''}` : '-'}
                  </td>
                  <td className="py-3 pr-4 text-[12px] text-muted font-mono">
                    {formatLatencyWithLoss(nvr.latest_ping_latency_ms, nvr.latest_ping_packet_loss_pct)}
                  </td>
                  <td className="py-3 pr-4">
                    {nvr.api_status === null || nvr.api_status === undefined
                      ? <span className="badge-unknown">-</span>
                      : <span className={nvr.api_status ? 'badge-online' : 'badge-offline'}>
                          {nvr.api_status ? 'OK' : 'Fail'}
                        </span>
                    }
                  </td>
                  <td className="py-3 pr-4 text-[12px] text-muted whitespace-nowrap">
                    {nvr.last_seen ? formatDate(nvr.last_seen) : '-'}
                  </td>
                  <td className="py-3">
                    <button onClick={() => checkMut.mutate(nvr.id)} className="btn-ghost text-[11px] py-1 px-2 flex items-center gap-1">
                      <Zap size={10} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <NvrFormModal
          sites={sites}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['nvrs'] }) }}
        />
      )}
    </div>
  )
}

export function NvrDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)

  const { data: device, isLoading } = useQuery({
    queryKey: ['device', id],
    queryFn: () => devicesApi.get(id!),
    refetchInterval: 20_000,
    enabled: !!id,
  })
  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: sitesApi.list })

  const checkMut = useMutation({
    mutationFn: () => devicesApi.triggerCheck(id!),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['device', id] }), 3000),
  })

  if (isLoading) return <div className="p-6"><Spinner /></div>
  if (!device) return <div className="p-6 text-danger">NVR not found</div>

  function InfoRow({ label, value }: { label: string; value?: string | null }) {
    return (
      <div className="flex justify-between py-2 border-b border-border text-sm">
        <span className="text-muted text-[12px]">{label}</span>
        <span className="text-text font-medium text-[12px]">{value || '-'}</span>
      </div>
    )
  }

  const pingState = pingStateLabel(device.ping_status, device.latest_ping_packet_loss_pct)

  return (
    <div className="p-6 max-w-5xl">
      <Link to="/nvrs" className="flex items-center gap-1.5 text-muted text-xs hover:text-text mb-5 transition-colors">
        <ArrowLeft size={12} /> Back to NVRs
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <StatusDot status={device.status} />
          <div>
            <h1 className="text-[16px] font-semibold">{device.name}</h1>
            <div className="text-[12px] text-muted mt-0.5">{device.site_name} · {device.ip_address}</div>
          </div>
          <StatusBadge status={device.status} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => checkMut.mutate()} disabled={checkMut.isPending}
            className="btn-teal flex items-center gap-1.5 text-xs py-1.5 px-3">
            <Zap size={12} />{checkMut.isPending ? 'Checking...' : 'Check Now'}
          </button>
          <button onClick={() => setEditOpen(true)} className="btn-ghost flex items-center gap-1.5 text-xs py-1.5 px-3">
            <Pencil size={12} /> Edit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 mb-5">
        <div className="card">
          <div className="label">NVR Information</div>
          <InfoRow label="Name" value={device.name} />
          <InfoRow label="Site" value={device.site_name} />
          <InfoRow label="IP Address" value={device.ip_address} />
          <InfoRow label="Port" value={String(device.port)} />
          <InfoRow label="Vendor" value={device.vendor} />
          <InfoRow label="Model" value={device.model} />
          <InfoRow label="Serial Number" value={device.serial_number} />
          <InfoRow label="Firmware" value={device.firmware_version} />
        </div>
        <div className="card">
          <div className="label">Health Status</div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-muted">Ping</span>
              <span className={pingState.className}>{pingState.label}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-muted">API Health</span>
              {device.api_status === null || device.api_status === undefined
                ? <span className="badge-unknown">Unknown</span>
                : <span className={device.api_status ? 'badge-online' : 'badge-offline'}>{device.api_status ? 'OK' : 'Fail'}</span>
              }
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-muted">Ping Latency</span>
              <span className="text-[12px] text-text font-mono">
                {formatLatencyWithLoss(device.latest_ping_latency_ms, device.latest_ping_packet_loss_pct)}
              </span>
            </div>
            <div className="flex justify-between items-center border-t border-border pt-3">
              <span className="text-[12px] text-muted">Last Seen</span>
              <span className="text-[12px]">{device.last_seen ? formatDate(device.last_seen) : '-'}</span>
            </div>
            {device.downtime_seconds > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-muted">Total Downtime</span>
                <span className="text-[12px] text-danger">{formatDowntime(device.downtime_seconds)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {device.open_alerts?.length > 0 && (
        <div className="card mb-5">
          <div className="label flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-warning" /> Open Alerts ({device.open_alerts.length})
          </div>
          <div className="space-y-2">
            {device.open_alerts.map(alert => (
              <div key={alert.id} className="bg-surface2 border border-border rounded p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-text truncate">{alert.title}</div>
                    <div className="text-[11px] text-muted mt-0.5">{alert.alert_type?.replace(/_/g, ' ')} · {formatDate(alert.created_at)}</div>
                  </div>
                  <span className={severityBadgeClass(alert.severity)}>{alert.severity}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {device.recent_checks?.length > 0 && (
        <div className="card">
          <div className="label">Recent Checks</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Type', 'Result', 'Latency', 'Error', 'Time'].map(h => (
                  <th key={h} className="text-left text-[11px] text-muted font-medium pb-2 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {device.recent_checks.map(c => (
                <tr key={c.id} className="border-b border-border/40">
                  <td className="py-2 pr-4"><span className="badge-unknown uppercase text-[10px]">{c.check_type}</span></td>
                  <td className="py-2 pr-4"><span className={c.success ? 'badge-online' : 'badge-offline'}>{c.success ? 'Pass' : 'Fail'}</span></td>
                  <td className="py-2 pr-4 text-[12px] text-muted font-mono">{formatLatencyWithLoss(c.latency_ms, c.packet_loss_pct)}</td>
                  <td className="py-2 pr-4 text-[12px] text-danger max-w-[200px] truncate">{c.error_message || '-'}</td>
                  <td className="py-2 text-[12px] text-muted">{formatDate(c.checked_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editOpen && (
        <NvrFormModal
          sites={sites}
          nvr={device}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); qc.invalidateQueries({ queryKey: ['device', id] }) }}
        />
      )}
    </div>
  )
}
