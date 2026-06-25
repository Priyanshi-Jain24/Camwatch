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

function timelineTooltipText(bucket: DeviceHealthTimelineBucket) {
  return [
    `${shortTime(bucket.start_at)} - ${shortTime(bucket.end_at)}`,
    `Status: ${timelineStatusLabel(bucket.status)}`,
    `Reason: ${bucket.reason}`,
    ...bucket.checks.map(check => `${check.label}: ${check.detail}`),
  ].join('\n')
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
    <div className="card py-3.5 px-4">
      <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-full border border-border bg-surface2/35 flex items-center justify-center shrink-0">
            <Server size={22} className="text-muted" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <StatusDot status={currentStatus === 'no_data' ? 'unknown' : currentStatus} />
                <h1 className="text-[16px] font-semibold text-text truncate">{device.name}</h1>
              </div>
              <DeviceTypeBadge type={device.device_type} />
            </div>
            <div className="text-[12px] text-muted mt-0.5 truncate">{device.site_name || '-'}</div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="badge-unknown">IP: {device.ip_address}</span>
              {device.vendor && <span className="badge-unknown">Vendor: {device.vendor}</span>}
              {device.model && <span className="badge-unknown">Model: {device.model}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 2xl:min-w-[650px]">
          <div className="rounded-lg border border-border bg-surface px-3 py-2.5 min-h-[78px]">
            <div className={cn('inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg', statusClass)}>
              <span className={cn('w-2 h-2 rounded-full inline-block', statusDotClass(currentStatus))} />
              {statusLabel}
            </div>
            <div className="text-[10px] text-muted mt-1.5">
              Since {lastSeen ? shortDateLabel(lastSeen) : 'No recent update'}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface px-3 py-2.5 min-h-[78px]">
            <div className="text-[10px] text-muted mb-1.5">Latency</div>
            <div className="text-[18px] font-semibold text-text tabular-nums">
              {latencyMs !== null && latencyMs !== undefined ? Math.round(latencyMs) : '-'}
              {latencyMs !== null && latencyMs !== undefined && <span className="text-[12px] ml-1">ms</span>}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface px-3 py-2.5 min-h-[78px]">
            <div className="text-[10px] text-muted mb-1.5">Last Seen</div>
            <div className="text-[18px] font-semibold text-text tabular-nums leading-tight">{shortTime(lastSeen)}</div>
            <div className="text-[10px] text-muted mt-1">{lastSeen ? 'Today' : 'No data'}</div>
          </div>

          <div className="rounded-lg border border-border bg-surface px-3 py-2.5 min-h-[78px]">
            <div className="text-[10px] text-muted mb-1.5">Uptime (24h)</div>
            <div className={cn('text-[18px] font-semibold tabular-nums', uptimeColor(uptime24hPercent))}>
              {uptime24hPercent.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CurrentHealthSection({
  checks,
  onlineMinutes,
  degradedMinutes,
  offlineMinutes,
  noDataMinutes,
}: {
  checks: DeviceHealthCheck[]
  onlineMinutes: number
  degradedMinutes: number
  offlineMinutes: number
  noDataMinutes: number
}) {
  const summaryItems = [
    { label: 'Online', value: onlineMinutes, className: 'text-success', dot: 'bg-success' },
    { label: 'Degraded', value: degradedMinutes, className: 'text-warning', dot: 'bg-warning' },
    { label: 'Offline', value: offlineMinutes, className: 'text-danger', dot: 'bg-danger' },
    { label: 'No Data', value: noDataMinutes, className: 'text-muted', dot: 'bg-muted' },
  ]
  const liveCheckGridClass = checks.length <= 2 ? 'grid grid-cols-1 gap-1.5' : 'grid grid-cols-2 gap-1.5'

  return (
    <Panel title="Current Health" className="p-4">
      <div className="overflow-x-auto pb-1">
        <div className="grid grid-cols-2 gap-3 items-stretch min-w-[860px]">
        <div className="rounded-lg border border-border bg-surface/70 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-1.5">Live Checks</div>
          <div className={liveCheckGridClass}>
        {checks.map(check => {
          const tone = healthTone(check.status)
          return (
            <div key={check.key} className={cn('rounded border px-2.5 py-2 min-h-[64px]', tone.card)}>
              <div className="flex items-start gap-1.5">
                <div className={cn('w-5 h-5 rounded-full flex items-center justify-center shrink-0', tone.iconWrap)}>
                  {healthIcon(check.status)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold text-text truncate">{check.label}</div>
                    <div className={cn('text-[11px] font-semibold shrink-0', tone.text)}>
                      {check.status === 'healthy' ? 'Pass' : check.status === 'warning' ? 'Delayed' : check.status === 'failed' ? 'Fail' : 'No Data'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
                    <span className={cn('text-[10px] truncate', check.status === 'failed' ? 'text-danger' : 'text-muted')}>
                      {check.reason}
                    </span>
                    {check.metrics && <span className="text-[10px] text-muted shrink-0">{check.metrics}</span>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface/70 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-1.5">24h Status Summary</div>
          <div className="grid grid-cols-2 gap-1.5">
            {summaryItems.map(item => (
              <div key={item.label} className="rounded border border-border bg-surface2/20 px-2.5 py-2 min-h-[64px]">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-text truncate">
                    <span className={cn('w-2 h-2 rounded-full inline-block', item.dot)} />
                    {item.label}
                  </div>
                  <div className="text-[10px] text-muted">({((item.value / 1440) * 100).toFixed(1)}%)</div>
                </div>
                <div className={cn('text-[13px] font-semibold tabular-nums mt-1.5', item.className)}>
                  {durationLabel(item.value)}
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    </Panel>
  )
}

export function HealthTimeline({ timeline }: { timeline: DeviceHealthTimelineBucket[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)
  const hoveredBucket = activeIndex !== null ? timeline[activeIndex] : null

  return (
    <Panel title="Last 24 Hours Health Timeline">
      <div className="relative">
      <div className="flex flex-wrap items-center gap-5 mb-4">
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
      </div>

      <div className="relative pb-1">
        <div className="w-full">
          <div className="grid gap-1" style={{ gridTemplateColumns: TIMELINE_COLUMNS }}>
            {timeline.map((bucket, index) => (
              <button
                key={bucket.start_at}
                type="button"
                className={cn(
                  'h-7 rounded transition-all border border-transparent',
                  timelineStatusClasses(bucket.status),
                  activeIndex === index && 'scale-[1.03] ring-2 ring-black/15 border-accent/35',
                )}
                onMouseEnter={(event) => {
                  setActiveIndex(index)
                  setTooltipPosition({ x: event.clientX, y: event.clientY })
                }}
                onMouseMove={(event) => setTooltipPosition({ x: event.clientX, y: event.clientY })}
                onMouseLeave={() => {
                  setActiveIndex(null)
                  setTooltipPosition(null)
                }}
                onPointerEnter={(event) => {
                  setActiveIndex(index)
                  setTooltipPosition({ x: event.clientX, y: event.clientY })
                }}
                onPointerMove={(event) => setTooltipPosition({ x: event.clientX, y: event.clientY })}
                onPointerLeave={() => {
                  setActiveIndex(null)
                  setTooltipPosition(null)
                }}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => {
                  setActiveIndex(null)
                  setTooltipPosition(null)
                }}
                onClick={(event) => {
                  setActiveIndex(index)
                  setTooltipPosition({ x: event.clientX, y: event.clientY })
                }}
                aria-label={`${shortDateLabel(bucket.start_at)} ${timelineStatusLabel(bucket.status)}`}
                title={timelineTooltipText(bucket)}
              />
            ))}
          </div>

          <div className="grid gap-1 mt-2 text-[8px] sm:text-[9px] text-muted" style={{ gridTemplateColumns: TIMELINE_COLUMNS }}>
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

      {hoveredBucket && tooltipPosition && (
          <div
            className="fixed pointer-events-none z-[100] w-[255px] rounded-lg border border-black/20 bg-black/90 text-white shadow-2xl p-4"
            style={{
              left: `min(${tooltipPosition.x + 14}px, calc(100vw - 275px))`,
              top: `max(${tooltipPosition.y - 18}px, 12px)`,
            }}
          >
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
        <div className="max-h-[360px] overflow-y-auto pr-2 space-y-5 table-scroll">
          {events.map((event, index) => (
            <div key={`${event.timestamp}-${index}`} className="flex gap-4">
              <div className="flex flex-col items-center shrink-0">
                <div className="w-9 h-9 rounded-full border border-border bg-surface2/40 flex items-center justify-center">
                  {eventIcon(event.severity)}
                </div>
                {index !== events.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
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
    <div className="flex items-start gap-2 rounded border border-border bg-surface2/15 px-2.5 py-2 min-h-[54px]">
      <div className="w-4 h-4 flex items-center justify-center text-muted mt-0.5 shrink-0">
        {infoIcon(label)}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted">{label}</div>
        <div className="text-[12px] text-text break-words leading-snug">{value || '-'}</div>
      </div>
    </div>
  )
}

export function DeviceInfoCard({ device }: { device: Device }) {
  const items = [
    ['Type', device.device_type.toUpperCase()],
    ['IP Address', device.ip_address],
    ['HTTP Port', String(device.port)],
    ['RTSP Port', String(device.rtsp_port)],
    ['Username', device.username],
    ['Vendor', device.vendor],
    ['Model', device.model],
    ['Serial No.', device.serial_number],
    ['Firmware', device.firmware_version],
    ['Site', device.site_name],
    ['Added On', shortDateLabel(device.created_at)],
    ['Notes', device.notes],
  ] as const

  return (
    <Panel title="Device Information">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {items.map(([label, value]) => (
          <InfoItem key={label} label={label} value={value} />
        ))}
      </div>
    </Panel>
  )
}
