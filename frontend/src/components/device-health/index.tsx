import { useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Dot,
  Info,
  Server,
  TriangleAlert,
  Wifi,
  XCircle,
} from 'lucide-react'
import { cn, formatDate, formatDowntime, statusBadgeClass, statusDisplayLabel, uptimeColor } from '@/utils'
import type {
  Device,
  DeviceHealthCheck,
  DeviceHealthEvent,
  DeviceHealthTimelineBucket,
  DeviceTimelineStatus,
} from '@/types'
import { DeviceTypeBadge, InfoRow, Panel, StatusDot } from '@/components/shared'

function healthTone(status: DeviceHealthCheck['status']) {
  switch (status) {
    case 'healthy':
      return {
        card: 'border-success/30 bg-success/5',
        iconWrap: 'bg-success/15 text-success border border-success/25',
        text: 'text-success',
      }
    case 'warning':
      return {
        card: 'border-warning/30 bg-warning/5',
        iconWrap: 'bg-warning/15 text-warning border border-warning/25',
        text: 'text-warning',
      }
    case 'failed':
      return {
        card: 'border-danger/30 bg-danger/5',
        iconWrap: 'bg-danger/15 text-danger border border-danger/25',
        text: 'text-danger',
      }
    default:
      return {
        card: 'border-border bg-surface2/30',
        iconWrap: 'bg-surface2 text-muted border border-border',
        text: 'text-muted',
      }
  }
}

function healthIcon(status: DeviceHealthCheck['status']) {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 size={18} />
    case 'warning':
      return <TriangleAlert size={18} />
    case 'failed':
      return <XCircle size={18} />
    default:
      return <Info size={18} />
  }
}

function severityIcon(severity: DeviceHealthEvent['severity']) {
  switch (severity) {
    case 'critical':
      return <XCircle size={16} className="text-danger" />
    case 'high':
      return <AlertCircle size={16} className="text-danger" />
    case 'medium':
      return <TriangleAlert size={16} className="text-warning" />
    default:
      return <CheckCircle2 size={16} className="text-success" />
  }
}

function timelineStatusClasses(status: DeviceTimelineStatus) {
  switch (status) {
    case 'online':
      return 'bg-success/85 hover:bg-success'
    case 'degraded':
      return 'bg-warning/85 hover:bg-warning'
    case 'offline':
      return 'bg-danger/85 hover:bg-danger'
    default:
      return 'bg-border2/60 hover:bg-border2'
  }
}

function timelineStatusLabel(status: DeviceTimelineStatus) {
  if (status === 'no_data') return 'No Data'
  return statusDisplayLabel(status)
}

function timeLabel(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function compactDateTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function durationLabel(minutes: number) {
  return formatDowntime(minutes * 60)
}

export function DeviceHealthSummary({
  device,
  currentStatus,
  uptime24hPercent,
  latencyMs,
  lastSeen,
}: {
  device: Device
  currentStatus: DeviceTimelineStatus
  uptime24hPercent: number
  latencyMs?: number | null
  lastSeen?: string | null
}) {
  const statusClass = statusBadgeClass(currentStatus === 'no_data' ? 'unknown' : currentStatus)
  const statusLabel = currentStatus === 'no_data' ? 'No Data' : statusDisplayLabel(currentStatus)

  return (
    <div className="card">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-14 h-14 rounded-full border border-border bg-surface2/50 flex items-center justify-center shrink-0">
            <Server size={24} className="text-muted" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <StatusDot status={currentStatus === 'no_data' ? 'unknown' : currentStatus} />
                <h1 className="text-[24px] leading-tight font-semibold text-text">{device.name}</h1>
              </div>
              <DeviceTypeBadge type={device.device_type} />
            </div>
            <div className="text-sm text-muted mt-1">{device.site_name || '-'}</div>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="badge-unknown">IP: {device.ip_address}</span>
              {device.vendor && <span className="badge-unknown">Vendor: {device.vendor}</span>}
              {device.model && <span className="badge-unknown">Model: {device.model}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 xl:min-w-[640px]">
          <div className="rounded-lg border border-border bg-surface2/35 px-4 py-3">
            <div className="text-xs text-muted mb-2">Current Status</div>
            <div className={cn('inline-flex items-center gap-2 text-lg font-semibold', statusClass)}>
              <span className="w-2 h-2 rounded-full bg-current inline-block" />
              {statusLabel}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface2/35 px-4 py-3">
            <div className="text-xs text-muted mb-2">Latency</div>
            <div className="text-[28px] leading-none font-semibold text-text tabular-nums">
              {latencyMs !== null && latencyMs !== undefined ? Math.round(latencyMs) : '-'}
              {latencyMs !== null && latencyMs !== undefined && <span className="text-base ml-1">ms</span>}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface2/35 px-4 py-3">
            <div className="text-xs text-muted mb-2">Last Seen</div>
            <div className="text-[28px] leading-none font-semibold text-text tabular-nums">{timeLabel(lastSeen)}</div>
            <div className="text-xs text-muted mt-1">{lastSeen ? compactDateTime(lastSeen) : 'No data'}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface2/35 px-4 py-3">
            <div className="text-xs text-muted mb-2">Uptime (24h)</div>
            <div className={cn('text-[28px] leading-none font-semibold tabular-nums', uptimeColor(uptime24hPercent))}>
              {uptime24hPercent.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function HealthCheckCards({ checks }: { checks: DeviceHealthCheck[] }) {
  return (
    <Panel title="Current Health">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {checks.map(check => {
          const tone = healthTone(check.status)
          return (
            <div key={check.key} className={cn('rounded-lg border px-4 py-4 min-h-[132px]', tone.card)}>
              <div className="flex items-start gap-3">
                <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', tone.iconWrap)}>
                  {healthIcon(check.status)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text">{check.label}</div>
                  <div className={cn('text-lg font-semibold mt-1', tone.text)}>
                    {check.status === 'healthy'
                      ? 'Pass'
                      : check.status === 'warning'
                        ? 'Warning'
                        : check.status === 'failed'
                          ? 'Fail'
                          : 'No Data'}
                  </div>
                </div>
              </div>
              <div className="mt-4 text-sm text-text break-words">{check.reason}</div>
              {check.metrics && <div className="mt-2 text-xs text-muted">{check.metrics}</div>}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export function HealthTimeline({
  timeline,
  onlineMinutes,
  degradedMinutes,
  offlineMinutes,
  noDataMinutes,
}: {
  timeline: DeviceHealthTimelineBucket[]
  onlineMinutes: number
  degradedMinutes: number
  offlineMinutes: number
  noDataMinutes: number
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const hoveredBucket = activeIndex !== null ? timeline[activeIndex] : null
  const summary = useMemo(() => ([
    { label: 'Online', value: onlineMinutes, className: 'text-success' },
    { label: 'Degraded', value: degradedMinutes, className: 'text-warning' },
    { label: 'Offline', value: offlineMinutes, className: 'text-danger' },
    { label: 'No Data', value: noDataMinutes, className: 'text-muted' },
  ]), [degradedMinutes, noDataMinutes, offlineMinutes, onlineMinutes])

  return (
    <Panel title="Last 24 Hours Health Timeline">
      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-5">
        <div className="rounded-lg border border-border bg-surface2/25 p-4">
          <div className="text-xs text-muted mb-3">Current Status Summary</div>
          <div className="grid grid-cols-2 gap-3">
            {summary.map(item => (
              <div key={item.label} className="rounded-lg border border-border bg-surface px-3 py-3">
                <div className="flex items-center gap-2 text-sm text-text">
                  <Dot size={20} className={item.className} />
                  {item.label}
                </div>
                <div className={cn('text-2xl font-semibold tabular-nums mt-2', item.className)}>
                  {durationLabel(item.value)}
                </div>
                <div className="text-xs text-muted mt-1">{((item.value / 1440) * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface2/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap gap-4 text-sm">
              {[
                ['Online', 'bg-success'],
                ['Degraded', 'bg-warning'],
                ['Offline', 'bg-danger'],
                ['No Data', 'bg-border2'],
              ].map(([label, swatch]) => (
                <div key={label} className="flex items-center gap-2 text-muted">
                  <span className={cn('w-3 h-3 rounded-full inline-block', swatch)} />
                  {label}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-ghost text-xs py-1.5 px-3 border-accent text-accent">24 Hours</button>
              <button className="btn-ghost text-xs py-1.5 px-3 opacity-60 cursor-default" disabled>7 Days</button>
              <button className="btn-ghost text-xs py-1.5 px-3 opacity-60 cursor-default" disabled>30 Days</button>
            </div>
          </div>

          <div className="relative overflow-x-auto pb-2">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-24 gap-1.5">
              {timeline.map((bucket, index) => (
                <button
                  key={bucket.start_at}
                  type="button"
                  className={cn(
                    'h-11 rounded-md transition-all border border-transparent',
                    timelineStatusClasses(bucket.status),
                    activeIndex === index && 'scale-[1.03] ring-2 ring-accent/45 border-accent/40',
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  onBlur={() => setActiveIndex(null)}
                  aria-label={`${compactDateTime(bucket.start_at)} ${timelineStatusLabel(bucket.status)}`}
                />
              ))}
              </div>

              {hoveredBucket && (
                <div className="absolute left-0 top-14 z-10 w-[280px] max-w-full rounded-lg border border-border bg-surface shadow-2xl p-4">
                  <div className="text-sm font-semibold text-text">
                    {timeLabel(hoveredBucket.start_at)} - {timeLabel(hoveredBucket.end_at)}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={statusBadgeClass(hoveredBucket.status === 'no_data' ? 'unknown' : hoveredBucket.status)}>
                      {timelineStatusLabel(hoveredBucket.status)}
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-text">{hoveredBucket.reason}</div>
                  <div className="mt-3 space-y-2">
                    {hoveredBucket.checks.map(check => (
                      <div key={check.label} className="flex items-start gap-2 text-sm">
                        <span className={cn(
                          'mt-0.5',
                          check.status === 'healthy'
                            ? 'text-success'
                            : check.status === 'warning'
                              ? 'text-warning'
                              : check.status === 'failed'
                                ? 'text-danger'
                                : 'text-muted',
                        )}>
                          {check.status === 'healthy'
                            ? <CheckCircle2 size={14} />
                            : check.status === 'warning'
                              ? <TriangleAlert size={14} />
                              : check.status === 'failed'
                                ? <XCircle size={14} />
                                : <Info size={14} />}
                        </span>
                        <div>
                          <div className="text-text">{check.label}</div>
                          <div className="text-muted text-xs">{check.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-24 gap-1.5 mt-3 text-[11px] text-muted">
                {timeline.map(bucket => (
                  <div key={`${bucket.start_at}-label`} className="text-center whitespace-nowrap">
                    {new Date(bucket.start_at).toLocaleString('en-IN', {
                      hour: 'numeric',
                      hour12: true,
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

export function EventHistory({ events }: { events: DeviceHealthEvent[] }) {
  return (
    <Panel title="Event History">
      {events.length === 0 ? (
        <div className="text-sm text-muted">No recent monitoring events in the last 24 hours.</div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto pr-2 space-y-4">
          {events.map((event, index) => (
            <div key={`${event.timestamp}-${index}`} className="flex gap-3">
              <div className="w-9 h-9 rounded-full border border-border bg-surface2/45 flex items-center justify-center shrink-0">
                {severityIcon(event.severity)}
              </div>
              <div className="flex-1 min-w-0 border-b border-border/60 pb-4 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-text">{event.title}</div>
                  <span className={statusBadgeClass(event.status === 'no_data' ? 'unknown' : event.status)}>
                    {timelineStatusLabel(event.status)}
                  </span>
                </div>
                {event.reason && <div className="text-sm text-muted mt-1">{event.reason}</div>}
                <div className="text-xs text-muted mt-2">{formatDate(event.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

export function DeviceInfoCard({ device }: { device: Device }) {
  return (
    <Panel title="Device Information">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8">
        <div>
          <InfoRow label="Vendor" value={device.vendor} />
          <InfoRow label="Model" value={device.model} />
          <InfoRow label="Serial Number" value={device.serial_number} />
          <InfoRow label="Firmware" value={device.firmware_version} />
          <InfoRow label="IP Address" value={device.ip_address} />
          <InfoRow label="HTTP Port" value={String(device.port)} />
        </div>
        <div>
          <InfoRow label="RTSP Port" value={String(device.rtsp_port)} />
          <InfoRow label="Username" value={device.username} />
          <InfoRow label="Site" value={device.site_name} />
          <InfoRow label="Added On" value={compactDateTime(device.created_at)} />
          {device.device_type === 'nvr' && (
            <>
              <InfoRow label="Total Channels" value={device.channel_count !== null && device.channel_count !== undefined ? String(device.channel_count) : '-'} />
              <InfoRow label="Channels Used" value={device.channels_used !== null && device.channels_used !== undefined ? String(device.channels_used) : '-'} />
            </>
          )}
          {device.rtsp_url && <InfoRow label="RTSP URL" value={device.rtsp_url} />}
          <InfoRow label="Notes" value={device.notes} />
        </div>
      </div>
    </Panel>
  )
}

export function DeviceHealthStatusStrip({
  onlineMinutes,
  degradedMinutes,
  offlineMinutes,
  noDataMinutes,
}: {
  onlineMinutes: number
  degradedMinutes: number
  offlineMinutes: number
  noDataMinutes: number
}) {
  const items = [
    { label: 'Online', value: onlineMinutes, className: 'text-success', icon: <Wifi size={16} className="text-success" /> },
    { label: 'Degraded', value: degradedMinutes, className: 'text-warning', icon: <TriangleAlert size={16} className="text-warning" /> },
    { label: 'Offline', value: offlineMinutes, className: 'text-danger', icon: <XCircle size={16} className="text-danger" /> },
    { label: 'No Data', value: noDataMinutes, className: 'text-muted', icon: <Clock3 size={16} className="text-muted" /> },
  ]

  return (
    <Panel title="Current Status Summary">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {items.map(item => (
          <div key={item.label} className="rounded-lg border border-border bg-surface2/30 px-4 py-4">
            <div className="flex items-center gap-2 text-sm text-text">
              {item.icon}
              {item.label}
            </div>
            <div className={cn('text-3xl font-semibold tabular-nums mt-3', item.className)}>
              {durationLabel(item.value)}
            </div>
            <div className="text-xs text-muted mt-1">{((item.value / 1440) * 100).toFixed(1)}%</div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
