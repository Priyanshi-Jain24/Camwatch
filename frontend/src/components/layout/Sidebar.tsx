import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, MapPin, Bell, BarChart3, LogOut, Video } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/utils'

// Simplified nav — Cameras/NVRs/Import removed (now live inside Sites)
const NAV = [
  { to: '/',        label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/sites',   label: 'Sites',     Icon: MapPin },
  { to: '/alerts',  label: 'Alerts',    Icon: Bell },
  { to: '/reports', label: 'Reports',   Icon: BarChart3 },
]

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const { pathname } = useLocation()
  const { user, logout } = useAuthStore()

  return (
    <aside
      className={cn(
        'flex-shrink-0 bg-[var(--sidebar-bg)] border-r border-border flex flex-col overflow-hidden transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-[64px]' : 'w-[185px]'
      )}
    >
      {/* Logo */}
      <div className={cn('px-4 py-5 border-b border-border', collapsed && 'px-0 flex flex-col items-center')}>
        <div className={cn('flex items-center gap-2 mb-1', collapsed && 'justify-center mb-0')}>
          <Video size={16} className="text-accent" />
          {!collapsed && <span className="text-[13px] font-bold tracking-wide text-text">CAMWATCH</span>}
        </div>
        {!collapsed && <div className="text-[10px] text-muted">CCTV Monitoring Platform</div>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2">
        {NAV.map(({ to, label, Icon }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={cn(
                active ? 'nav-item-active' : 'nav-item',
                collapsed && 'justify-center px-0 gap-0'
              )}
            >
              <Icon size={14} className="opacity-70 shrink-0" />
              {!collapsed && label}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className={cn('border-t border-border px-4 py-3', collapsed && 'px-0 flex justify-center')}>
        {!collapsed && (
          <>
            <div className="text-[11px] text-text truncate mb-1">{user?.full_name || user?.email}</div>
            <div className="text-[10px] text-muted truncate">{user?.email}</div>
            <div className="text-[10px] text-muted truncate mb-2">{user?.role === 'ADMIN' ? 'Admin' : 'User'}</div>
          </>
        )}
        <button
          onClick={logout}
          className={cn(
            'flex items-center gap-1.5 text-[11px] text-muted hover:text-danger transition-colors',
            collapsed && 'justify-center'
          )}
          title={collapsed ? 'Sign out' : undefined}
          aria-label="Sign out"
        >
          <LogOut size={11} />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  )
}
