import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from '@/components/shared'
import { useAuthStore } from '@/store/auth'
import { Bell, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { alertsApi } from '@/api'
import { Link } from 'react-router-dom'

function TopBar({
  sidebarCollapsed,
  onToggleSidebar,
}: {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}) {
  const { user } = useAuthStore()
  const { data: summary } = useQuery({
    queryKey: ['alert-summary'],
    queryFn: alertsApi.summary,
    refetchInterval: 30_000,
  })

  return (
    <header className="h-12 bg-[var(--sidebar-bg)] border-b border-border flex items-center justify-between px-5 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="btn-icon w-8 h-8"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
        <div className="text-[11px] text-muted">
          {new Date().toLocaleString('en-IN', {
            weekday: 'short', day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit'
          })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Link to="/alerts" className="relative btn-icon w-8 h-8">
          <Bell size={14} className="text-muted" />
          {(summary?.open ?? 0) > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-danger text-white rounded-full text-[8px] flex items-center justify-center font-bold">
              {summary!.open > 9 ? '9+' : summary!.open}
            </span>
          )}
        </Link>
        <ThemeToggle />
        <div className="text-[11px] text-muted border-l border-border pl-3">
          {user?.full_name || user?.email}
        </div>
      </div>
    </header>
  )
}

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar collapsed={sidebarCollapsed} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(v => !v)}
        />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
