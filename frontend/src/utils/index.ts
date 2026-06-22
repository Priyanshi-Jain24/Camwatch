import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { DeviceType, RtspStreamType } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function readableFieldName(loc?: unknown[]): string {
  const field = loc?.[loc.length - 1]
  return String(field || 'Field').replace(/_/g, ' ')
}

export function apiErrorMessage(error: any, fallback = 'Request failed'): string {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map(item => {
        if (typeof item === 'string') return item
        if (item?.msg) return `${readableFieldName(item.loc)}: ${item.msg}`
        return null
      })
      .filter(Boolean)
      .join('; ') || fallback
  }
  if (detail && typeof detail === 'object') {
    return detail.message || detail.msg || fallback
  }
  return error?.message || fallback
}

export function isValidIpAddress(value: string): boolean {
  const ip = value.trim()
  if (!ip) return false

  const ipv4 =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
  const ipv6 =
    /^(([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:)|([0-9A-Fa-f]{1,4}:){1,7}:|:((:[0-9A-Fa-f]{1,4}){1,7}|:)|([0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4})$/

  return ipv4.test(ip) || ipv6.test(ip)
}

function vendorFamily(vendor?: string): 'hikvision' | 'uniview' | 'dahua' | 'axis' | 'cpplus' | 'generic' {
  const value = (vendor || '').trim().toLowerCase()
  if (value.includes('hikvision') || value.includes('prama')) return 'hikvision'
  if (value.includes('uniview') || value.includes('unv')) return 'uniview'
  if (value.includes('dahua')) return 'dahua'
  if (value.includes('axis')) return 'axis'
  if (value.includes('cp plus') || value.includes('cpplus') || value.includes('cp-plus')) return 'cpplus'
  return 'generic'
}

export function generateRtspUrl(
  vendor: string | undefined,
  ipAddress: string | undefined,
  rtspPort: number | string | undefined,
  username: string | undefined,
  password: string | undefined,
  streamType: RtspStreamType = 'main',
  deviceType: DeviceType = 'nvr',
): string {
  const host = String(ipAddress || '').trim()
  const port = Number(rtspPort || 554)
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return ''

  const user = String(username || '').trim()
  const pwd = String(password || '').trim()
  const credentials = user && pwd
    ? `${encodeURIComponent(user)}:${encodeURIComponent(pwd)}@`
    : ''

  const family = vendorFamily(vendor)
  let path = '/stream1'

  if (family === 'hikvision' || (deviceType === 'nvr' && family === 'generic')) {
    path = streamType === 'main' ? '/Streaming/Channels/101' : '/Streaming/Channels/102'
  } else if (family === 'uniview') {
    path = streamType === 'main' ? '/unicast/c1/s0/live' : '/unicast/c1/s1/live'
  } else if (family === 'dahua') {
    path = streamType === 'main' ? '/cam/realmonitor?channel=1&subtype=0' : '/cam/realmonitor?channel=1&subtype=1'
  } else if (family === 'axis') {
    path = streamType === 'main' ? '/axis-media/media.amp' : '/axis-media/media.amp?videocodec=h264&resolution=640x480'
  } else if (family === 'cpplus') {
    path = streamType === 'main' ? '/stream1' : '/stream2'
  } else if (deviceType === 'camera') {
    path = streamType === 'main' ? '/stream1' : '/stream2'
  }

  return `rtsp://${credentials}${host}:${port}${path}`
}

export function formatDowntime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

export function uptimeColor(pct: number): string {
  if (pct >= 95) return 'text-success'
  if (pct >= 80) return 'text-warning'
  return 'text-danger'
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'online': return 'badge-online'
    case 'degraded': return 'badge-degraded'
    case 'offline': return 'badge-offline'
    default: return 'badge-unknown'
  }
}

export function statusDisplayLabel(status: string): string {
  switch (status) {
    case 'degraded': return 'Degraded'
    case 'online': return 'Online'
    case 'offline': return 'Offline'
    default: return 'Unknown'
  }
}

export function formatLatencyWithLoss(latencyMs?: number | null, packetLossPct?: number | null): string {
  const latencyText = latencyMs !== null && latencyMs !== undefined
    ? `${Math.round(latencyMs)}ms`
    : '-'
  const packetLossText = packetLossPct !== null && packetLossPct !== undefined && packetLossPct > 0 && packetLossPct < 100
    ? `${Math.round(packetLossPct)}% loss`
    : null
  return packetLossText ? `${latencyText} · ${packetLossText}` : latencyText
}

export function pingStateLabel(
  pingOk?: boolean | null,
  packetLossPct?: number | null,
): { label: string; className: string } {
  if (pingOk === null || pingOk === undefined) {
    return { label: '-', className: 'badge-unknown' }
  }
  if (!pingOk) {
    return { label: 'Fail', className: 'badge-offline' }
  }
  if (packetLossPct !== null && packetLossPct !== undefined && packetLossPct > 0) {
    return { label: 'Warning', className: 'badge-degraded' }
  }
  return { label: 'Pass', className: 'badge-online' }
}

export function severityBadgeClass(severity: string): string {
  switch (severity) {
    case 'critical': return 'badge-critical'
    case 'high': return 'badge-high'
    case 'medium': return 'badge-medium'
    default: return 'badge-low'
  }
}

export function stateBadgeClass(state: string): string {
  switch (state) {
    case 'open': return 'badge-open'
    case 'acknowledged': return 'badge-acknowledged'
    case 'resolved': return 'badge-resolved'
    default: return 'badge-unknown'
  }
}
