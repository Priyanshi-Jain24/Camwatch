import { useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  HardDrive,
  Info,
  Monitor,
  RefreshCw,
  Router,
  Server,
  ShieldAlert,
  TriangleAlert,
  User,
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
import { DeviceTypeBadge, Panel, StatusDot } from '@/components/shared'

const TIMELINE_COLUMNS = 'repeat(24, minmax(0, 1fr))'

function healthTone(status: DeviceHealthCheck['status']) {
  switch (status) {
    case 'healthy':
      return {
        card: 'border-success/25 bg-surface',
        iconWrap: 'bg-success/15 text-success border border-success/20',
        text: 'text-success',
      }
    case 'warning':
      return {
        card: 'border-warning/25 bg-surface',
        iconWrap: 'bg-warning/15 text-warning border border-warning/20',
        text: 'text-warning',
      }
    case 'failed':
      return {
        card: 'border-danger/25 bg-surface',
        iconWrap: 'bg-danger/15 text-danger border border-danger/20',
        text: 'text-danger',
      }
    default:
      return {
        card: 'border-border bg-surface',
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

function eventIcon(severity: DeviceHealthEvent['severity']) {
  switch (severity) {
    case 'critical':
      return <XCircle size={16} className="text-danger" />
    case 'high':
      return <ShieldAlert size={16} className="text-danger" />
    case 'medium':
      return <TriangleAlert size={16} className="text-warning" />
    default:
      return <CheckCircle2 size={16} className="text-success" />
  }
}

function timelineStatusClasses(status: DeviceTimelineStatus) {
  switch (status) {
    case 'online':
      return 'bg-success/90 hover:bg-success'
    case 'degraded':
      return 'bg-warning/90 hover:bg-warning'
    case 'offline':
      return 'bg-danger/90 hover:bg-danger'
    default:
      return 'bg-border2/60 hover:bg-border2'
  }
}

function timelineStatusLabel(status: DeviceTimelineStatus) {
  return status === 'no_data' ? 'No Data' : statusDisplayLabel(status)
}

function shortTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function shortDateLabel(value?: string | null) {
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

function statusDotClass(status: DeviceTimelineStatus) {
  switch (status) {
    case 'online':
      return 'bg-success'
    case 'degraded':
      return 'bg-warning'
    case 'offline':
      return 'bg-danger'
    default:
      return 'bg-muted'
  }
}

function durationLabel(minutes: number) {
  return formatDowntime(minutes * 60)
}

function infoIcon(label: string) {
  const key = label.toLowerCase()
  if (key.includes('type')) return <Server size={15} />
  if (key.includes('ip')) return <Globe size={15} />
  if (key.includes('http')) return <Monitor size={15} />
  if (key.includes('rtsp')) return <Router size={15} />
  if (key.includes('user')) return <User size={15} />
  if (key.includes('firmware')) return <RefreshCw size={15} />
  if (key.includes('vendor') || key.includes('model') || key.includes('serial')) return <HardDrive size={15} />
  if (key.includes('site')) return <Globe size={15} />
  return <Info size={15} />
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
  const statusLabel = timelineStatusLabel(currentStatus)

  return (
    <div className="card py-4 px-5">
      <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="w-16 h-16 rounded-full border border-border bg-surface2/35 flex items-center justify-center shrink-0">
            <Server size={28} className="text-muted" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <StatusDot status={currentStatus === 'no_data' ? 'unknown' : currentStatus} />
                <h1 className="text-[18px] font-semibold text-text truncate">{device.name}</h1>
              </div>
              <DeviceTypeBadge type={device.device_type} />
            </div>
            <div className="text-[13px] text-muted mt-1 truncate">{device.site_name || '-'}</div>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="badge-unknown">IP: {device.ip_address}</span>
              {device.vendor && <span className="badge-unknown">Vendor: {device.vendor}</span>}
              {device.model && <span className="badge-unknown">Model: {device.model}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 2xl:min-w-[760px]">
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className={cn('inline-flex items-center gap-2 text-[14px] font-semibold px-3 py-2 rounded-lg', statusClass)}>
              <span className={cn('w-2.5 h-2.5 rounded-full inline-block', statusDotClass(currentStatus))} />
              {statusLabel}
            </div>
            <div className="text-[11px] text-muted mt-2">
              Since {lastSeen ? shortDateLabel(lastSeen) : 'No recent update'}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="text-[11px] text-muted mb-2">Latency</div>
            <div className="text-[22px] font-semibold text-text tabular-nums">
              {latencyMs !== null && latencyMs !== undefined ? Math.round(latencyMs) : '-'}
              {latencyMs !== null && latencyMs !== undefined && <span className="text-[14px] ml-1">ms</span>}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="text-[11px] text-muted mb-2">Last Seen</div>
            <div className="text-[22px] font-semibold text-text tabular-nums">{shortTime(lastSeen)}</div>
            <div className="text-[11px] text-muted mt-1">{lastSeen ? 'Today' : 'No data'}</div>
          </div>

          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="text-[11px] text-muted mb-2">Uptime (24h)</div>
            <div className={cn('text-[22px] font-semibold tabular-nums', uptimeColor(uptime24hPercent))}>
              {uptime24hPercent.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CurrentHealthSection({ checks }: { checks: DeviceHealthCheck[] }) {
  return (
    <Panel title="Current Health">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {checks.map(check => {
          const tone = healthTone(check.status)
          return (
            <div key={check.key} className={cn('rounded-lg border px-4 py-4 min-h-[128px]', tone.card)}>
              <div className="flex items-start gap-3">
                <div className={cn('w-12 h-12 rounded-full flex items-center justify-center shrink-0', tone.iconWrap)}>
                  {healthIcon(check.status)}
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-text">{check.label}</div>
                  <div className={cn('text-[16px] font-semibold mt-1', tone.text)}>
                    {check.status === 'healthy' ? 'Pass' : check.status === 'warning' ? 'Delayed' : check.status === 'failed' ? 'Fail' : 'No Data'}
                  </div>
                </div>
              </div>
              <div className={cn('text-[13px] mt-4 break-words', check.status === 'failed' ? 'text-danger' : 'text-text')}>
                {check.reason}
              </div>
              {check.metrics && <div className="text-[12px] text-muted mt-2">{check.metrics}</div>}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export function CurrentStatusSummary({
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
    { label: 'Online', value: onlineMinutes, className: 'text-success', dot: 'bg-success' },
    { label: 'Degraded', value: degradedMinutes, className: 'text-warning', dot: 'bg-warning' },
    { label: 'Offline', value: offlineMinutes, className: 'text-danger', dot: 'bg-danger' },
    { label: 'No Data', value: noDataMinutes, className: 'text-muted', dot: 'bg-muted' },
  ]

  return (
    <Panel title="Current Status Summary">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {items.map(item => (
          <div key={item.label} className="rounded-lg border border-border bg-surface px-4 py-4">
            <div className="flex items-center gap-2 text-[13px] text-text">
              <span className={cn('w-3 h-3 rounded-full inline-block', item.dot)} />
              {item.label}
            </div>
            <div className={cn('text-[18px] font-semibold tabular-nums mt-3', item.className)}>
              {durationLabel(item.value)}
            </div>
            <div className="text-[12px] text-muted mt-1">({((item.value / 1440) * 100).toFixed(1)}%)</div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function HealthTimeline({ timeline }: { timeline: DeviceHealthTimelineBucket[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const hoveredBucket = activeIndex !== null ? timeline[activeIndex] : null

  return (
    <Panel title="Last 24 Hours Health Timeline">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-5 text-[13px]">
          {[
            ['Online', 'bg-success'],
            ['Degraded', 'bg-warning'],
            ['Offline', 'bg-danger'],
            ['No Data', 'bg-muted'],
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
        <div className="min-w-[1080px]">
          <div className="grid gap-2" style={{ gridTemplateColumns: TIMELINE_COLUMNS }}>
            {timeline.map((bucket, index) => (
              <button
                key={bucket.start_at}
                type="button"
                className={cn(
                  'h-10 rounded-md transition-all border border-transparent',
                  timelineStatusClasses(bucket.status),
                  activeIndex === index && 'scale-[1.03] ring-2 ring-black/15 border-accent/35',
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
                aria-label={`${shortDateLabel(bucket.start_at)} ${timelineStatusLabel(bucket.status)}`}
              />
            ))}
          </div>

          <div className="grid gap-2 mt-3 text-[12px] text-text" style={{ gridTemplateColumns: TIMELINE_COLUMNS }}>
            {timeline.map((bucket) => (
              <div key={`${bucket.start_at}-label`} className="text-center whitespace-nowrap">
                {new Date(bucket.start_at).toLocaleString('en-IN', {
                  hour: 'numeric',
                  hour12: true,
                })}
              </div>
            ))}
          </div>
        </div>

        {hoveredBucket && (
          <div className="absolute left-[280px] top-[-10px] z-20 w-[255px] rounded-lg border border-black/20 bg-black/90 text-white shadow-2xl p-4">
            <div className="text-[13px] font-semibold">
              {shortTime(hoveredBucket.start_at)} - {shortTime(hoveredBucket.end_at)}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[13px]">
              <span className={cn('w-2.5 h-2.5 rounded-full inline-block', statusDotClass(hoveredBucket.status))} />
              {timelineStatusLabel(hoveredBucket.status)}
            </div>
            <div className="mt-3 text-[12px] text-white/85">Reason:</div>
            <div className="text-[12px] text-white/85">{hoveredBucket.reason}</div>
            <div className="mt-3 space-y-2">
              {hoveredBucket.checks.map(check => (
                <div key={check.label} className="flex items-start gap-2 text-[12px]">
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
                      ? <CheckCircle2 size={13} />
                      : check.status === 'warning'
                        ? <TriangleAlert size={13} />
                        : check.status === 'failed'
                          ? <XCircle size={13} />
                          : <Info size={13} />}
                  </span>
                  <div>{check.label}: {check.detail}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}

export function EventHistory({ events }: { events: DeviceHealthEvent[] }) {
  return (
    <Panel title="Event History (Last 24 Hours)">
      {events.length === 0 ? (
        <div className="text-sm text-muted">No recent monitoring events.</div>
      ) : (
        <div className="space-y-5">
          {events.slice(0, 6).map((event, index) => (
            <div key={`${event.timestamp}-${index}`} className="flex gap-4">
              <div className="flex flex-col items-center shrink-0">
                <div className="w-9 h-9 rounded-full border border-border bg-surface2/40 flex items-center justify-center">
                  {eventIcon(event.severity)}
                </div>
                {index !== Math.min(events.length, 6) - 1 && <div className="w-px flex-1 bg-border mt-1" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-semibold text-text">{event.title}</div>
                    {event.reason && <div className="text-[13px] text-muted mt-1">{event.reason}</div>}
                  </div>
                  <div className="text-[13px] text-muted whitespace-nowrap">{shortTime(event.timestamp)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function InfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="w-5 h-5 flex items-center justify-center text-muted mt-0.5 shrink-0">
        {infoIcon(label)}
      </div>
      <div className="min-w-0">
        <div className="text-[12px] text-muted">{label}</div>
        <div className="text-[14px] text-text break-words">{value || '-'}</div>
      </div>
    </div>
  )
}

export function DeviceInfoCard({ device }: { device: Device }) {
  return (
    <Panel title="Device Information">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-10">
        <div>
          <InfoItem label="Type" value={device.device_type.toUpperCase()} />
          <InfoItem label="IP Address" value={device.ip_address} />
          <InfoItem label="HTTP Port" value={String(device.port)} />
          <InfoItem label="RTSP Port" value={String(device.rtsp_port)} />
          <InfoItem label="Username" value={device.username} />
          <InfoItem label="Firmware" value={device.firmware_version} />
        </div>
        <div>
          <InfoItem label="Vendor" value={device.vendor} />
          <InfoItem label="Model" value={device.model} />
          <InfoItem label="Serial No." value={device.serial_number} />
          <InfoItem label="Site" value={device.site_name} />
          <InfoItem label="Added On" value={shortDateLabel(device.created_at)} />
          <InfoItem label="Notes" value={device.notes} />
        </div>
      </div>
    </Panel>
  )
}
