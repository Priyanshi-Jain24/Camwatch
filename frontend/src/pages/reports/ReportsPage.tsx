import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { reportsApi } from '@/api'
import { formatDowntime, uptimeColor, cn } from '@/utils'
import { PageHeader, Spinner, DeviceTypeBadge } from '@/components/shared'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'

type Period = 'daily' | 'weekly' | 'monthly'
type ReportView = 'devices' | 'sites'

const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Last 24 Hours',
  weekly: 'Last 7 Days',
  monthly: 'Last 30 Days',
}

function compactSiteName(siteName: string) {
  return siteName
    .replace(/^cars24\s+hub,\s*/i, '')
    .replace(/^cars24\s+/i, '')
    .replace(/^cec\s+cars24\s+hub,\s*/i, '')
    .replace(/^parking\s+cars24\s+hub,\s*/i, '')
    .replace(/^cec\s+and\s+parking,\s+cars24,\s*/i, '')
    .replace(/^parking,\s+cars24,\s*/i, '')
    .trim()
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const displayLabel = payload[0]?.payload?.fullName || label
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-text mb-1">{displayLabel}</div>
      <div className={uptimeColor(payload[0].value)}>
        Uptime: <span className="font-bold">{payload[0].value}%</span>
      </div>
    </div>
  )
}

function ActiveBarShape(props: any) {
  const { x = 0, y = 0, width = 0, height = 0, fill = 'rgb(var(--color-primary))' } = props
  const hoverLift = 4
  const hoverGrow = 4
  const safeY = Math.max(y - hoverLift, 0)
  const extraHeight = Math.min(hoverLift, y)

  return (
    <rect
      x={x - hoverGrow / 2}
      y={safeY}
      width={width + hoverGrow}
      height={height + extraHeight}
      rx={4}
      ry={4}
      fill={fill}
      fillOpacity={0.95}
      stroke="rgb(var(--color-border2))"
      strokeOpacity={0.5}
      strokeWidth={1}
    />
  )
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('daily')
  const [view, setView] = useState<ReportView>('devices')
  const [chartPage, setChartPage] = useState(0)

  const { data: report, isLoading } = useQuery({
    queryKey: ['uptime-report', period],
    queryFn: () => reportsApi.uptime(period),
    refetchInterval: 60_000,
  })

  const { data: siteReport, isLoading: isSiteLoading } = useQuery({
    queryKey: ['site-uptime-report', period],
    queryFn: () => reportsApi.siteUptime(period),
    refetchInterval: 60_000,
  })

  const deviceRows = report?.rows ?? []
  const siteRows = siteReport?.rows ?? []
  const rows = view === 'devices' ? deviceRows : siteRows

  const chartPageSize = 20
  const sortedChartRows = useMemo(
    () => [...rows].sort((a, b) => a.uptime_percent - b.uptime_percent),
    [rows],
  )
  const chartPageCount = Math.max(1, Math.ceil(sortedChartRows.length / chartPageSize))
  const safeChartPage = Math.min(chartPage, Math.max(chartPageCount - 1, 0))
  const chartStart = safeChartPage * chartPageSize
  const chartEnd = Math.min(chartStart + chartPageSize, sortedChartRows.length)

  const chartData = sortedChartRows
    .slice(chartStart, chartEnd)
    .map(r => {
      const label = 'device_name' in r ? r.device_name : compactSiteName(r.site_name)
      return {
        fullName: label,
        name: '',
        uptime: r.uptime_percent,
      }
    })

  useEffect(() => {
    setChartPage(0)
  }, [period, view])

  useEffect(() => {
    if (chartPage > chartPageCount - 1) {
      setChartPage(Math.max(chartPageCount - 1, 0))
    }
  }, [chartPage, chartPageCount])

  const avgUptime = rows.length ? Math.round(rows.reduce((s, r) => s + r.uptime_percent, 0) / rows.length * 10) / 10 : 0
  const under90 = rows.filter(r => r.uptime_percent < 90).length
  const under80 = rows.filter(r => r.uptime_percent < 80).length
  const fullUptime = rows.filter(r => r.uptime_percent >= 99.5).length

  const exportCsv = () => {
    if (!rows.length) return
    const headers = view === 'devices'
      ? ['Device', 'Site', 'Type', 'Uptime %', 'Downtime', 'Total Checks', 'Passed']
      : ['Site', 'Devices', 'Cameras', 'NVRs', 'Uptime %', 'Downtime', 'Total Checks', 'Passed']
    const lines = rows.map(r => {
      if ('device_name' in r) {
        return [
          r.device_name, r.site_name, r.device_type,
          r.uptime_percent, formatDowntime(r.downtime_seconds),
          r.total_checks, r.successful_checks,
        ].map(csvCell).join(',')
      }
      return [
        r.site_name, r.total_devices, r.camera_count, r.nvr_count,
        r.uptime_percent, formatDowntime(r.downtime_seconds),
        r.total_checks, r.successful_checks,
      ].map(csvCell).join(',')
    })
    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${view}-uptime-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const loading = isLoading || isSiteLoading

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Device and site uptime analytics"
        actions={
          <button onClick={exportCsv} disabled={!rows.length} className="btn-ghost text-xs py-1.5 px-3">
            <Download size={12} /> Export CSV
          </button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <div className="flex gap-1 bg-surface2 rounded-lg p-1 w-fit">
          {(['devices', 'sites'] as ReportView[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'text-xs px-4 py-1.5 rounded transition-colors font-medium capitalize',
                view === v ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-surface2 rounded-lg p-1 w-fit">
          {(['daily', 'weekly', 'monthly'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'text-xs px-4 py-1.5 rounded transition-colors font-medium',
                period === p ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              { label: view === 'devices' ? 'Devices Monitored' : 'Sites Monitored', value: rows.length, color: 'text-accent' },
              { label: 'Avg Uptime', value: avgUptime + '%', color: uptimeColor(avgUptime) },
              { label: 'Perfect Uptime', value: fullUptime, color: 'text-success' },
              { label: 'Below 90%', value: under90, color: under90 > 0 ? 'text-danger' : 'text-muted' },
            ].map(k => (
              <div key={k.label} className="card py-3 px-4 flex items-center justify-between">
                <div className="text-[11px] text-muted">{k.label}</div>
                <div className={cn('text-xl font-bold tabular-nums', k.color)}>{k.value}</div>
              </div>
            ))}
          </div>

          {chartData.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="label mb-0">Uptime by {view === 'devices' ? 'Device' : 'Site'}</div>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] text-muted">
                    Showing {chartStart + 1}-{chartEnd} of {sortedChartRows.length} {view}
                  </div>
                  {chartPageCount > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setChartPage(p => Math.max(0, p - 1))}
                        disabled={safeChartPage === 0}
                        className="btn-icon w-7 h-7 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartPage(p => Math.min(chartPageCount - 1, p + 1))}
                        disabled={safeChartPage >= chartPageCount - 1}
                        className="btn-icon w-7 h-7 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 0, right: 4, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border))" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={false}
                    axisLine={false}
                    tickLine={false}
                    height={10}
                  />
                  <YAxis
                    domain={[0, 100]} tickCount={6}
                    tick={{ fontSize: 10, fill: 'rgb(var(--color-muted))' }}
                    tickFormatter={v => `${v}%`}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={false} />
                  <Bar dataKey="uptime" radius={[3, 3, 0, 0]} maxBarSize={32} activeBar={<ActiveBarShape />}>
                    {chartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          entry.uptime >= 95 ? 'rgb(var(--color-success))' :
                          entry.uptime >= 80 ? 'rgb(var(--color-warning))' :
                          'rgb(var(--color-danger))'
                        }
                        fillOpacity={0.8}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <div className="label mb-0">{view === 'devices' ? 'Device' : 'Site'} Uptime Detail</div>
              <div className="text-[11px] text-muted">{rows.length} {view}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface2">
                    {(view === 'devices'
                      ? ['Device', 'Site', 'Type', 'Uptime %', 'Downtime', 'Checks', 'Passed']
                      : ['Site', 'Devices', 'Cameras', 'NVRs', 'Uptime %', 'Downtime', 'Checks', 'Passed']
                    ).map(h => (
                      <th key={h} className="table-header px-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={view === 'devices' ? 7 : 8} className="py-10 text-center text-muted text-sm">No data available for this period</td></tr>
                  ) : rows.map(row => (
                    <tr key={'device_id' in row ? row.device_id : row.site_id} className="table-row">
                      {'device_name' in row ? (
                        <>
                          <td className="table-cell px-4 font-medium">
                            <Link to={`/devices/${row.device_id}`} className="hover:text-accent transition-colors">
                              {row.device_name}
                            </Link>
                          </td>
                          <td className="table-cell px-4 text-muted">{row.site_name}</td>
                          <td className="table-cell px-4">
                            <DeviceTypeBadge type={row.device_type} />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="table-cell px-4 font-medium">{row.site_name}</td>
                          <td className="table-cell px-4 text-muted tabular-nums">{row.total_devices}</td>
                          <td className="table-cell px-4 text-muted tabular-nums">{row.camera_count}</td>
                          <td className="table-cell px-4 text-muted tabular-nums">{row.nvr_count}</td>
                        </>
                      )}
                      <td className="table-cell px-4">
                        <div className="flex items-center gap-2">
                          <span className={cn('font-bold tabular-nums', uptimeColor(row.uptime_percent))}>
                            {row.uptime_percent}%
                          </span>
                          <div className="w-16 bg-border2 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={cn('h-full rounded-full',
                                row.uptime_percent >= 95 ? 'bg-success' :
                                row.uptime_percent >= 80 ? 'bg-warning' : 'bg-danger'
                              )}
                              style={{ width: `${row.uptime_percent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="table-cell px-4 text-muted">
                        {row.downtime_seconds > 0
                          ? <span className="text-danger">{formatDowntime(row.downtime_seconds)}</span>
                          : <span className="text-success text-[11px]">None</span>
                        }
                      </td>
                      <td className="table-cell px-4 text-muted tabular-nums">{row.total_checks}</td>
                      <td className="table-cell px-4 text-success tabular-nums">{row.successful_checks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
