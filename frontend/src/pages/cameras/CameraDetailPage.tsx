import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { devicesApi, sitesApi } from '@/api'
import { formatDate, formatDowntime, formatLatencyWithLoss, pingStateLabel } from '@/utils'
import { StatusDot, StatusBadge, Spinner } from '@/components/shared'
import { ArrowLeft, Zap, Pencil } from 'lucide-react'
import { useState } from 'react'
import CameraFormModal from './CameraFormModal'

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between py-2 border-b border-border text-sm">
      <span className="text-muted text-[12px]">{label}</span>
      <span className="text-text font-medium text-[12px]">{value || '-'}</span>
    </div>
  )
}

function CheckBadge({ success }: { success: boolean }) {
  return (
    <span className={success ? 'badge-online' : 'badge-offline'}>{success ? 'Pass' : 'Fail'}</span>
  )
}

export default function CameraDetailPage() {
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
  if (!device) return <div className="p-6 text-danger">Camera not found</div>

  const pingState = pingStateLabel(device.ping_status, device.latest_ping_packet_loss_pct)

  return (
    <div className="p-6 max-w-5xl">
      <Link to="/cameras" className="flex items-center gap-1.5 text-muted text-xs hover:text-text mb-5 transition-colors">
        <ArrowLeft size={12} /> Back to Cameras
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
          <button
            onClick={() => checkMut.mutate()}
            disabled={checkMut.isPending}
            className="btn-teal flex items-center gap-1.5 text-xs py-1.5 px-3"
          >
            <Zap size={12} />
            {checkMut.isPending ? 'Checking...' : 'Check Now'}
          </button>
          <button onClick={() => setEditOpen(true)} className="btn-ghost flex items-center gap-1.5 text-xs py-1.5 px-3">
            <Pencil size={12} /> Edit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 mb-5">
        <div className="card">
          <div className="label">Device Information</div>
          <InfoRow label="Name" value={device.name} />
          <InfoRow label="Site" value={device.site_name} />
          <InfoRow label="IP Address" value={device.ip_address} />
          <InfoRow label="Port" value={String(device.port)} />
          <InfoRow label="Vendor" value={device.vendor} />
          <InfoRow label="Model" value={device.model} />
          <InfoRow label="Serial Number" value={device.serial_number} />
          <InfoRow label="Firmware" value={device.firmware_version} />
          <InfoRow label="MAC Address" value={device.mac_address} />
          <InfoRow label="RTSP URL" value={device.rtsp_url} />
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="label">Health Status</div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-muted">Ping</span>
                <span className={pingState.className}>{pingState.label}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-muted">Ping Latency</span>
                <span className="text-[12px] text-text font-mono">
                  {formatLatencyWithLoss(device.latest_ping_latency_ms, device.latest_ping_packet_loss_pct)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-muted">RTSP Stream</span>
                {device.rtsp_status === null || device.rtsp_status === undefined
                  ? <span className="badge-unknown">Unknown</span>
                  : <CheckBadge success={device.rtsp_status} />
                }
              </div>
              <div className="flex justify-between items-center border-t border-border pt-3">
                <span className="text-[12px] text-muted">Last Seen</span>
                <span className="text-[12px] text-text">{device.last_seen ? formatDate(device.last_seen) : '-'}</span>
              </div>
              {device.downtime_seconds > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted">Total Downtime</span>
                  <span className="text-[12px] text-danger">{formatDowntime(device.downtime_seconds)}</span>
                </div>
              )}
            </div>
          </div>

          {device.open_alerts && device.open_alerts.length > 0 && (
            <div className="card border-danger/20">
              <div className="label text-danger">Open Alerts</div>
              {device.open_alerts.map(a => (
                <div key={a.id} className="mb-2 px-3 py-2 bg-surface2 rounded border-l-2 border-l-danger">
                  <div className="text-[12px] text-text">{a.title}</div>
                  <div className="text-[11px] text-muted mt-0.5">{formatDate(a.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="label">Recent Checks (Last 20)</div>
        {!device.recent_checks?.length
          ? <div className="text-muted text-sm">No checks yet</div>
          : (
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
                    <td className="py-2 pr-4 text-[12px]">
                      <span className="badge-unknown uppercase">{c.check_type}</span>
                    </td>
                    <td className="py-2 pr-4"><CheckBadge success={c.success} /></td>
                    <td className="py-2 pr-4 text-[12px] text-muted font-mono">
                      {formatLatencyWithLoss(c.latency_ms, c.packet_loss_pct)}
                    </td>
                    <td className="py-2 pr-4 text-[12px] text-danger max-w-[200px] truncate">
                      {c.error_message || '-'}
                    </td>
                    <td className="py-2 text-[12px] text-muted">{formatDate(c.checked_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>

      {editOpen && (
        <CameraFormModal
          sites={sites}
          device={device}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); qc.invalidateQueries({ queryKey: ['device', id] }) }}
        />
      )}
    </div>
  )
}
