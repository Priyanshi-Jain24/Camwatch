import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { devicesApi } from '@/api'
import {
  CurrentHealthSection,
  CurrentStatusSummary,
  DeviceHealthSummary,
  DeviceInfoCard,
  EventHistory,
  HealthTimeline,
} from '@/components/device-health'
import { EmptyState, Spinner } from '@/components/shared'
import { ArrowLeft, RefreshCw } from 'lucide-react'

export default function DeviceHealthPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const deviceQuery = useQuery({
    queryKey: ['device', id],
    queryFn: () => devicesApi.get(id!),
    enabled: !!id,
    refetchInterval: 60_000,
  })

  const healthQuery = useQuery({
    queryKey: ['device-health-history', id],
    queryFn: () => devicesApi.healthHistory(id!),
    enabled: !!id,
    refetchInterval: 60_000,
  })

  const isLoading = deviceQuery.isLoading || healthQuery.isLoading
  const device = deviceQuery.data
  const health = healthQuery.data

  const backLabel = useMemo(() => {
    if (device?.device_type === 'camera') return 'Back to Cameras'
    if (device?.device_type === 'nvr') return 'Back to NVRs'
    return 'Back to Devices'
  }, [device?.device_type])

  if (isLoading) {
    return <div className="p-6"><Spinner /></div>
  }

  if (!device || !health) {
    return (
      <div className="p-6">
        <EmptyState message="Device details are unavailable right now." />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => navigate(-1)}
          className="btn-ghost text-xs py-1.5 px-2.5"
        >
          <ArrowLeft size={13} /> {backLabel}
        </button>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>Auto refresh: 60s</span>
          <button
            type="button"
            className="btn-icon"
            onClick={() => {
              deviceQuery.refetch()
              healthQuery.refetch()
            }}
            title="Refresh now"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <DeviceHealthSummary
        device={device}
        currentStatus={health.current_status}
        uptime24hPercent={health.uptime_24h_percent}
        latencyMs={health.latency_ms}
        lastSeen={health.last_seen}
      />

      <div className="grid grid-cols-1 2xl:grid-cols-[1fr_0.95fr] gap-5">
        <CurrentHealthSection checks={health.current_checks} />
        <CurrentStatusSummary
          onlineMinutes={health.online_minutes}
          degradedMinutes={health.degraded_minutes}
          offlineMinutes={health.offline_minutes}
          noDataMinutes={health.no_data_minutes}
        />
      </div>

      <HealthTimeline timeline={health.timeline} />

      <div className="grid grid-cols-1 2xl:grid-cols-[1.05fr_0.95fr] gap-5">
        <EventHistory events={health.events} />
        <DeviceInfoCard device={device} />
      </div>

      <div className="text-xs text-muted">
        <Link to="/devices" className="hover:text-text transition-colors">View all devices</Link>
      </div>
    </div>
  )
}
