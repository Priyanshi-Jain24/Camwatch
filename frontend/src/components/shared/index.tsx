import { cn, statusBadgeClass, severityBadgeClass, statusDisplayLabel } from '@/utils'
import type { DeviceStatus, AlertSeverity } from '@/types'
import { Sun, Moon } from 'lucide-react'
import { useThemeStore } from '@/store/theme'

export function ThemeToggle() {
  const { theme, toggle } = useThemeStore()

  return (
    <button
      onClick={toggle}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="btn-icon w-8 h-8"
    >
      {theme === 'dark'
        ? <Sun size={14} className="text-warning" />
        : <Moon size={14} className="text-accent" />}
    </button>
  )
}

export function StatusDot({ status }: { status: DeviceStatus }) {
  return (
    <span className="relative inline-flex items-center w-2 h-2">
      {status === 'online' && (
        <span className="absolute w-2 h-2 rounded-full bg-success opacity-30 animate-ping" />
      )}
      <span
        className={cn(
          'w-2 h-2 rounded-full inline-block',
          status === 'online'
            ? 'bg-success'
            : status === 'degraded'
              ? 'bg-success'
              : status === 'offline'
                ? 'bg-danger'
                : 'bg-muted',
        )}
      />
    </span>
  )
}

export function StatusBadge({ status }: { status: DeviceStatus }) {
  return <span className={statusBadgeClass(status)}>{statusDisplayLabel(status)}</span>
}

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return <span className={severityBadgeClass(severity)}>{severity}</span>
}

export function DeviceTypeBadge({ type }: { type: string }) {
  return (
    <span className={type === 'nvr' ? 'badge-nvr' : 'badge-camera'}>
      {type.toUpperCase()}
    </span>
  )
}

export function StatCard({
  label, value, sub, color = 'text-text', icon,
}: {
  label: string
  value: string | number
  sub?: string
  color?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="card flex items-center justify-between py-4 px-5 gap-3">
      <div>
        <div className="text-[11px] text-muted leading-tight">{label}</div>
        {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
      </div>
      <div className="text-right">
        <div className={cn('text-2xl font-bold tabular-nums leading-none', color)}>{value}</div>
        {icon && <div className="flex justify-end mt-1 opacity-40">{icon}</div>}
      </div>
    </div>
  )
}

export function PageHeader({
  title, subtitle, actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h1 className="text-[15px] font-semibold text-text">{title}</h1>
        {subtitle && <div className="text-[11px] text-muted mt-0.5">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className="py-10 text-center">
      {icon && <div className="flex justify-center mb-3 opacity-30">{icon}</div>}
      <div className="text-muted text-sm">{message}</div>
    </div>
  )
}

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'

  return (
    <div className="flex items-center justify-center py-10">
      <div className={cn(sz, 'border-2 border-border border-t-accent rounded-full animate-spin')} />
    </div>
  )
}

export function ProgressBar({
  value, max, showLabel = false,
}: {
  value: number
  max: number
  showLabel?: boolean
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const barColor = pct >= 90 ? 'bg-success' : pct >= 60 ? 'bg-warning' : 'bg-danger'
  const textColor = pct >= 90 ? 'text-success' : pct >= 60 ? 'text-warning' : 'text-danger'

  return (
    <div>
      {showLabel && (
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-muted">{value}/{max} online</span>
          <span className={cn('font-semibold', textColor)}>{pct}%</span>
        </div>
      )}
      <div className="bg-border2 rounded-full h-1.5 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function Modal({
  title, onClose, children, width = 'max-w-lg', footer,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: string
  footer?: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={cn('bg-surface border border-border rounded-xl w-full shadow-2xl max-h-[90vh] flex flex-col', width)}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-[14px] font-semibold text-text">{title}</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-text transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-border flex-shrink-0 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function Panel({
  title, count, children, className, action,
}: {
  title: string
  count?: number
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  return (
    <div className={cn('card', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="label mb-0">
          {title}
          {count !== undefined && ` (${count})`}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between py-2 border-b border-border/60 text-sm last:border-0">
      <span className="text-muted text-[12px] shrink-0 mr-4">{label}</span>
      <span className="text-text font-medium text-[12px] text-right break-all">{value || '-'}</span>
    </div>
  )
}

export function ConfirmDialog({
  title, message, onConfirm, onCancel, confirmLabel = 'Delete', danger = true, loading = false,
}: {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
}) {
  return (
    <Modal title={title} onClose={onCancel} width="max-w-sm">
      <p className="text-sm text-text mb-5">{message}</p>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel} disabled={loading}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={loading}>
          {loading ? 'Deleting...' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
