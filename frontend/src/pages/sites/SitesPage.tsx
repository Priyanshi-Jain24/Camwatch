import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sitesApi, devicesApi } from '@/api'
import { Link, useNavigate } from 'react-router-dom'
import { apiErrorMessage, formatDate, formatDowntime, cn, isValidIpAddress, generateRtspUrl, formatLatencyWithLoss, pingStateLabel } from '@/utils'
import {
  Spinner, EmptyState, PageHeader, Modal, ConfirmDialog,
  StatusDot, StatusBadge, DeviceTypeBadge, ProgressBar, InfoRow, Panel
} from '@/components/shared'
import { Plus, Pencil, Trash2, Search, Zap, Upload, Download,
         ChevronRight, ChevronDown, Eye, EyeOff, X, FileText, CheckCircle, XCircle } from 'lucide-react'
import type { Site, Device } from '@/types'
import { useDropzone } from 'react-dropzone'
import { useAuthStore } from '@/store/auth'
import { isAdminUser } from '@/utils/permissions'

function compactSiteName(name: string) {
  const cleaned = name
    .replace(/\bcars\s*24\b/gi, '')
    .replace(/\bhub\b/gi, '')
    .replace(/\s*[-,()]+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return cleaned || name
}

function appScrollContainer(): HTMLElement | null {
  return document.querySelector('main.flex-1.overflow-y-auto')
}

function stripCityFromDisplayName(name: string, city?: string | null) {
  const compact = compactSiteName(name)
  const cityText = city?.trim()
  if (!cityText) return compact

  const escapedCity = cityText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const cleaned = compact
    .replace(new RegExp(`\\b${escapedCity}\\b`, 'gi'), '')
    .replace(/\s*[-,()]+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return cleaned || compact
}

// ─── Site Form ────────────────────────────────────────────────────────────────
function SiteForm({
  site, onClose, onSaved
}: { site?: Site; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name:          site?.name          ?? '',
    city:          site?.city          ?? '',
    address:       site?.address       ?? '',
    contact_name:  site?.contact_name  ?? '',
    contact_phone: site?.contact_phone ?? '',
    contact_email: site?.contact_email ?? '',
    regional_head_name: site?.regional_head_name ?? '',
    regional_head_contact: site?.regional_head_contact ?? '',
    regional_manager_name: site?.regional_manager_name ?? '',
    regional_manager_contact: site?.regional_manager_contact ?? '',
  })
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const mut = useMutation({
    mutationFn: site
      ? () => sitesApi.update(site.id, form)
      : () => sitesApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); onSaved() },
    onError: (e: any) => setError(apiErrorMessage(e, 'Failed to save')),
  })

  return (
    <Modal title={site ? 'Edit Site' : 'Add New Site'} onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="form-label">Site Name *</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Delhi HQ" />
        </div>
        <div>
          <label className="form-label">City</label>
          <input className="input" value={form.city} onChange={e => set('city', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Contact Person</label>
          <input className="input" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Phone</label>
          <input className="input" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Email</label>
          <input className="input" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="form-label">Address</label>
          <textarea className="textarea" rows={2} value={form.address} onChange={e => set('address', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Regional Head</label>
          <input className="input" value={form.regional_head_name} onChange={e => set('regional_head_name', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Head Contact</label>
          <input className="input" value={form.regional_head_contact} onChange={e => set('regional_head_contact', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Regional Manager</label>
          <input className="input" value={form.regional_manager_name} onChange={e => set('regional_manager_name', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Manager Contact</label>
          <input className="input" value={form.regional_manager_contact} onChange={e => set('regional_manager_contact', e.target.value)} />
        </div>
      </div>
      {error && <div className="text-danger text-xs mt-3">{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? 'Saving…' : site ? 'Update Site' : 'Create Site'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Unified Device Form ──────────────────────────────────────────────────────
function DeviceForm({
  siteId, device, nvrs, onClose, onSaved
}: {
  siteId: string; device?: Device; nvrs: Device[]
  onClose: () => void; onSaved: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!device
  const [form, setForm] = useState({
    device_type:    device?.device_type    ?? 'camera' as 'camera' | 'nvr',
    name:           device?.name           ?? '',
    ip_address:     device?.ip_address     ?? '',
    port:           device?.port           ?? 80,
    rtsp_port:      device?.rtsp_port      ?? 554,
    username:       device?.username       ?? 'admin',
    password:       device?.password       ?? '',
    rtsp_mode:      device?.rtsp_mode      ?? 'auto' as 'disabled' | 'auto' | 'custom',
    rtsp_stream_type: device?.rtsp_stream_type ?? 'main' as 'main' | 'sub',
    rtsp_url:       device?.rtsp_url       ?? '',
    vendor:         device?.vendor         ?? '',
    model:          device?.model          ?? '',
    serial_number:  device?.serial_number  ?? '',
    area:           device?.area           ?? '',
    channel_count:  device?.channel_count  ?? '',
    channels_used:  device?.channels_used  ?? '',
    http_url:       device?.http_url       ?? '',
    api_url:        device?.api_url        ?? '',
    recording_check_url: device?.recording_check_url ?? '',
    notes:          device?.notes          ?? '',
    nvr_id:         device?.nvr_id         ?? '',
  })
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const generatedRtspUrl = generateRtspUrl(
    form.vendor,
    form.ip_address,
    form.rtsp_port,
    form.username,
    form.password,
    form.rtsp_stream_type,
    form.device_type,
  )

  const applyGeneratedRtspUrl = () => {
    if (!generatedRtspUrl) {
      setError('Enter a valid IP, RTSP port, vendor, username and password to generate an RTSP URL')
      return
    }
    setError('')
    set('rtsp_mode', 'custom')
    set('rtsp_url', generatedRtspUrl)
  }

  const save = () => {
    if (!String(form.name).trim()) {
      setError(`${form.device_type === 'nvr' ? 'NVR' : 'Camera'} name is required`)
      return
    }
    if (!String(form.ip_address).trim()) {
      setError('IP address is required')
      return
    }
    if (!isValidIpAddress(String(form.ip_address))) {
      setError('Enter a valid IP address in IPv4 or IPv6 format')
      return
    }
    const rtspPort = Number(form.rtsp_port)
    if (!Number.isInteger(rtspPort) || rtspPort < 1 || rtspPort > 65535) {
      setError('RTSP port must be between 1 and 65535')
      return
    }
    if (form.device_type === 'nvr') {
      const totalChannels = form.channel_count ? Number(form.channel_count) : 0
      const channelsUsed = form.channels_used ? Number(form.channels_used) : 0
      if (totalChannels && (!Number.isInteger(totalChannels) || totalChannels < 1)) {
        setError('Total channels must be a positive whole number')
        return
      }
      if (channelsUsed && (!Number.isInteger(channelsUsed) || channelsUsed < 1)) {
        setError('Channels used must be a positive whole number')
        return
      }
      if (totalChannels && channelsUsed && channelsUsed > totalChannels) {
        setError('Channels used cannot be greater than total channels')
        return
      }
    }
    setError('')
    mut.mutate()
  }

  const mut = useMutation({
    mutationFn: isEdit
      ? () => devicesApi.update(device!.id, {
          ...form, site_id: siteId,
          nvr_id: form.nvr_id || null,
          port: Number(form.port),
          rtsp_port: Number(form.rtsp_port),
          channel_count: form.channel_count !== '' ? Number(form.channel_count) : undefined,
          channels_used: form.channels_used !== '' ? Number(form.channels_used) : undefined,
        })
      : () => devicesApi.create({
          ...form, site_id: siteId,
          nvr_id: form.nvr_id || null,
          port: Number(form.port),
          rtsp_port: Number(form.rtsp_port),
          channel_count: form.channel_count !== '' ? Number(form.channel_count) : undefined,
          channels_used: form.channels_used !== '' ? Number(form.channels_used) : undefined,
        }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices', siteId] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onSaved()
    },
    onError: (e: any) => setError(apiErrorMessage(e, 'Failed to save')),
  })

  return (
    <Modal title={isEdit ? `Edit — ${device!.name}` : 'Add Device'} onClose={onClose} width="max-w-xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Device type */}
        <div className="sm:col-span-2">
          <label className="form-label">Device Type *</label>
          <div className="flex gap-2">
            {(['camera', 'nvr'] as const).map(t => (
              <button
                key={t}
                onClick={() => set('device_type', t)}
                className={cn(
                  'flex-1 py-2 rounded border text-sm font-medium transition-colors',
                  form.device_type === t
                    ? 'bg-primary/20 border-primary/50 text-text'
                    : 'bg-surface2 border-border text-muted hover:border-border2'
                )}
              >
                {t === 'camera' ? '📷 Camera' : '🖥 NVR'}
              </button>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="form-label">Device Name *</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)}
            placeholder={form.device_type === 'nvr' ? 'NVR-01' : 'CAM-01'} />
        </div>
        <div>
          <label className="form-label">IP Address *</label>
          <input className="input font-mono" value={form.ip_address}
            onChange={e => set('ip_address', e.target.value)} placeholder="192.168.1.101" />
        </div>
        <div>
          <label className="form-label">HTTP Port</label>
          <input className="input font-mono" type="number" value={form.port}
            onChange={e => set('port', e.target.value)} />
        </div>
        <div>
          <label className="form-label">RTSP Port</label>
          <input className="input font-mono" type="number" value={form.rtsp_port}
            onChange={e => set('rtsp_port', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Username</label>
          <input className="input" value={form.username} onChange={e => set('username', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Password</label>
          <div className="relative">
            <input className="input pr-9" type={showPassword ? 'text' : 'password'} value={form.password}
              onChange={e => set('password', e.target.value)} />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text"
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div>
          <label className="form-label">Vendor</label>
          <select className="select w-full" value={form.vendor} onChange={e => set('vendor', e.target.value)}>
            <option value="">Select vendor</option>
            <option value="Hikvision">Hikvision</option>
            <option value="UNV">Uniview / UNV</option>
          </select>
        </div>
        <div>
          <label className="form-label">Stream Type</label>
          <select className="select w-full" value={form.rtsp_stream_type}
            onChange={e => set('rtsp_stream_type', e.target.value)}>
            <option value="main">Main Stream</option>
            <option value="sub">Sub Stream</option>
          </select>
        </div>
        <div>
          <label className="form-label">Model</label>
          <input className="input" value={form.model} onChange={e => set('model', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Serial Number</label>
          <input className="input" value={form.serial_number}
            onChange={e => set('serial_number', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Area / Location</label>
          <input className="input" value={form.area} onChange={e => set('area', e.target.value)}
            placeholder="Parking Entrance" />
        </div>

        {/* Camera-specific: NVR linking */}
        {form.device_type === 'camera' && (
          <div>
            <label className="form-label">Linked NVR (optional)</label>
            <select className="select w-full" value={form.nvr_id}
              onChange={e => set('nvr_id', e.target.value)}>
              <option value="">— Standalone —</option>
              {nvrs.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>
        )}

        {form.device_type === 'camera' && (
          <div className="sm:col-span-2">
            <label className="form-label">RTSP Mode</label>
            <div className="flex gap-2">
              {([
                ['auto', 'Auto'],
                ['custom', 'Custom'],
                ['disabled', 'Disabled'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('rtsp_mode', value)}
                  className={cn(
                    'flex-1 py-2 rounded border text-sm font-medium transition-colors',
                    form.rtsp_mode === value
                      ? 'bg-primary/20 border-primary/50 text-text'
                      : 'bg-surface2 border-border text-muted hover:border-border2'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-muted mt-1">
              Auto builds the RTSP URL, custom uses your exact URL, disabled skips RTSP monitoring.
            </div>
          </div>
        )}

        {form.device_type === 'camera' && form.rtsp_mode === 'custom' && (
          <div className="sm:col-span-2">
            <label className="form-label">Custom RTSP URL</label>
            <input className="input font-mono text-xs" value={form.rtsp_url}
              onChange={e => set('rtsp_url', e.target.value)}
              placeholder="rtsp://user:pass@192.168.1.101:554/stream1" />
          </div>
        )}

        {form.device_type === 'camera' && form.rtsp_mode !== 'disabled' && (
          <div className="sm:col-span-2 rounded-lg border border-border bg-surface2/40 p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-xs font-medium text-text">Generated RTSP URL</div>
              <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={applyGeneratedRtspUrl}>
                Generate RTSP URL
              </button>
            </div>
            <div className="text-[11px] font-mono break-all text-muted">
              {generatedRtspUrl || 'Provide vendor, IP, RTSP port, username and password to generate a URL.'}
            </div>
          </div>
        )}

        {form.device_type === 'nvr' && (
          <>
            <div>
              <label className="form-label">Total Channels</label>
              <input className="input font-mono" type="number" value={form.channel_count}
                onChange={e => set('channel_count', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Channels Used</label>
              <input className="input font-mono" type="number" value={form.channels_used}
                onChange={e => set('channels_used', e.target.value)} />
            </div>
            <div>
              <label className="form-label">HTTP URL</label>
              <input className="input font-mono text-xs" value={form.http_url}
                onChange={e => set('http_url', e.target.value)} placeholder="http://192.168.1.200/" />
            </div>
            <div className="sm:col-span-2">
              <label className="form-label">API URL</label>
              <input className="input font-mono text-xs" value={form.api_url}
                onChange={e => set('api_url', e.target.value)} placeholder="http://192.168.1.200/api/health" />
            </div>
            <div className="sm:col-span-2">
              <label className="form-label">Recording Check URL</label>
              <input className="input font-mono text-xs" value={form.recording_check_url}
                onChange={e => set('recording_check_url', e.target.value)} placeholder="http://192.168.1.200/api/recording" />
            </div>
            <div className="sm:col-span-2">
              <label className="form-label">RTSP Mode</label>
              <div className="flex gap-2">
                {([
                  ['auto', 'Auto'],
                  ['custom', 'Custom'],
                  ['disabled', 'Disabled'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('rtsp_mode', value)}
                    className={cn(
                      'flex-1 py-2 rounded border text-sm font-medium transition-colors',
                      form.rtsp_mode === value
                        ? 'bg-primary/20 border-primary/50 text-text'
                        : 'bg-surface2 border-border text-muted hover:border-border2'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-muted mt-1">
                Auto builds the RTSP URL, custom uses your exact URL, disabled skips RTSP monitoring.
              </div>
            </div>
            {form.rtsp_mode === 'custom' && (
              <div className="sm:col-span-2">
                <label className="form-label">Custom NVR RTSP URL</label>
                <input className="input font-mono text-xs" value={form.rtsp_url}
                  onChange={e => set('rtsp_url', e.target.value)}
                  placeholder="rtsp://user:pass@192.168.1.200:554/Streaming/Channels/101" />
              </div>
            )}
            {form.rtsp_mode !== 'disabled' && (
              <div className="sm:col-span-2 rounded-lg border border-border bg-surface2/40 p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="text-xs font-medium text-text">Generated RTSP URL</div>
                  <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={applyGeneratedRtspUrl}>
                    Generate RTSP URL
                  </button>
                </div>
                <div className="text-[11px] font-mono break-all text-muted">
                  {generatedRtspUrl || 'Provide vendor, IP, RTSP port, username and password to generate a URL.'}
                </div>
              </div>
            )}
          </>
        )}

        <div className="sm:col-span-2">
          <label className="form-label">Notes</label>
          <textarea className="textarea" rows={2} value={form.notes}
            onChange={e => set('notes', e.target.value)} placeholder="Location or configuration notes…" />
        </div>
      </div>

      {error && <div className="text-danger text-xs mt-3">{error}</div>}
      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={mut.isPending}>
          {mut.isPending ? 'Saving…' : isEdit ? 'Update Device' : 'Add Device'}
        </button>
      </div>
    </Modal>
  )
}

// ─── CSV Import (inside site) ─────────────────────────────────────────────────
function CsvImportModal({
  siteId, siteName, onClose, onDone
}: {
  siteId?: string; siteName?: string; onClose: () => void; onDone: () => void
}) {
  const qc = useQueryClient()
  const [result, setResult] = useState<any>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)

  const mut = useMutation({
    mutationFn: (file: File) => devicesApi.importCsv(file),
    onSuccess: (data) => {
      setResult(data)
      setUploading(false)
      if (data.errors) {
        try { setErrors(JSON.parse(data.errors)) } catch { setErrors([data.errors]) }
      }
      qc.invalidateQueries({ queryKey: ['sites'] })
      if (siteId) qc.invalidateQueries({ queryKey: ['devices', siteId] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e: any) => {
      setUploading(false)
      setErrors([apiErrorMessage(e, 'Upload failed')])
    },
  })

  const onDrop = useCallback((accepted: File[]) => {
    if (!accepted[0]) return
    setResult(null); setErrors([]); setUploading(true)
    mut.mutate(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'text/csv': ['.csv'] }, multiple: false,
  })

  return (
    <Modal title={siteName ? `Import Devices - ${siteName}` : 'Import Sites & Devices'} onClose={onClose} width="max-w-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] text-muted">CSV must include your standard hub/NVR columns or the legacy device import columns</div>
        <button
          onClick={() => devicesApi.downloadTemplate()}
          className="btn-ghost text-xs py-1 px-2.5"
        >
          <Download size={11} /> Template
        </button>
      </div>

      <div className="bg-surface2 border border-border rounded p-3 mb-4 text-[11px] text-muted">
        <div className="font-semibold text-text mb-1">Supported formats:</div>
        <div>Standard NVR sheet: <code>Hub Name · NVR Name · Public Static IP Address</code></div>
        <div className="mt-1">Also supported: <code>site_name · device_name · device_type · ip_address</code></div>
        <div className="mt-1">Ports, credentials, RTSP mode, brand, channel capacity, and remarks are imported when present.</div>
      </div>

      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-4',
          isDragActive ? 'border-accent bg-accent/5' : 'border-border hover:border-border2'
        )}
      >
        <input {...getInputProps()} />
        <Upload size={22} className="mx-auto mb-2 text-muted" />
        {uploading
          ? <div className="text-sm text-muted">Uploading…</div>
          : isDragActive
            ? <div className="text-sm text-accent">Drop CSV here</div>
            : <div>
                <div className="text-sm text-text mb-1">Drag & drop CSV, or click to browse</div>
                <div className="text-[11px] text-muted">Only .csv files - missing sites are created from site_name</div>
              </div>
        }
      </div>

      {errors.length > 0 && (
        <div className="p-3 bg-danger/5 border border-danger/20 rounded mb-4">
          {errors.map((e, i) => <div key={i} className="text-[11px] text-danger">{e}</div>)}
        </div>
      )}

      {result && (
        <div className={cn('p-4 rounded border-l-2 mb-4',
          result.failed_rows === 0 ? 'bg-success/5 border-l-success' : 'bg-warning/5 border-l-warning'
        )}>
          <div className="flex items-center gap-2 mb-2">
            {result.failed_rows === 0
              ? <CheckCircle size={15} className="text-success" />
              : <XCircle size={15} className="text-warning" />
            }
            <span className="text-[13px] font-medium">
              Import Complete — {result.success_rows}/{result.total_rows} succeeded
            </span>
          </div>
          <div className="flex gap-5 text-[11px]">
            <span className="text-success">✓ {result.success_rows} imported</span>
            <span className="text-danger">✗ {result.failed_rows} failed</span>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {result
          ? <button className="btn-primary" onClick={onDone}>Done</button>
          : <button className="btn-ghost" onClick={onClose}>Cancel</button>
        }
      </div>
    </Modal>
  )
}

// ─── Device hierarchy tree ────────────────────────────────────────────────────
function DeviceHierarchy({ devices }: { devices: Device[] }) {
  const nvrs = devices.filter(d => d.device_type === 'nvr')
  const standalone = devices.filter(d => d.device_type === 'camera' && !d.nvr_id)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(nvrs.map(n => n.id)))

  const toggle = (id: string) => {
    const s = new Set(expanded)
    s.has(id) ? s.delete(id) : s.add(id)
    setExpanded(s)
  }

  if (devices.length === 0) return (
    <EmptyState message="No devices in this site" />
  )

  return (
    <div className="space-y-1">
      {nvrs.map(nvr => {
        const linked = devices.filter(d => d.device_type === 'camera' && d.nvr_id === nvr.id)
        const open = expanded.has(nvr.id)
        return (
          <div key={nvr.id}>
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface2 cursor-pointer transition-colors"
              onClick={() => toggle(nvr.id)}
            >
              {open
                ? <ChevronDown size={12} className="text-muted shrink-0" />
                : <ChevronRight size={12} className="text-muted shrink-0" />
              }
              <StatusDot status={nvr.status} />
              <span className="text-[12px] font-semibold">{nvr.name}</span>
              <span className="badge-nvr">NVR</span>
              <span className="text-[10px] text-muted ml-1">{nvr.ip_address}</span>
              <span className="text-[10px] text-muted ml-auto">{linked.length} cam{linked.length !== 1 ? 's' : ''}</span>
            </div>
            {open && linked.map(cam => (
              <div key={cam.id} className="flex items-center gap-2 px-2 py-1.5 ml-6 rounded hover:bg-surface2 transition-colors">
                <div className="w-3 h-px bg-border" />
                <StatusDot status={cam.status} />
                <span className="text-[12px]">{cam.name}</span>
                <span className="badge-camera">CAM</span>
                <span className="text-[10px] text-muted">{cam.ip_address}</span>
                {cam.status === 'offline' && cam.downtime_seconds > 0 && (
                  <span className="text-[10px] text-danger ml-auto">
                    Down {formatDowntime(cam.downtime_seconds)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )
      })}
      {standalone.length > 0 && (
        <div>
          <div className="text-[10px] text-muted px-2 py-1 mt-2">Standalone Cameras</div>
          {standalone.map(cam => (
            <div key={cam.id} className="flex items-center gap-2 px-2 py-1.5 ml-4 rounded hover:bg-surface2 transition-colors">
              <StatusDot status={cam.status} />
              <span className="text-[12px]">{cam.name}</span>
              <span className="badge-camera">CAM</span>
              <span className="text-[10px] text-muted">{cam.ip_address}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Site Detail ──────────────────────────────────────────────────────────────
function SiteDetail({
  site, onBack, onEdit, canManage
}: {
  site: Site; onBack: () => void; onEdit: () => void; canManage: boolean
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const displayName = stripCityFromDisplayName(site.name, site.city)
  const [modal, setModal] = useState<'addDevice' | 'editDevice' | 'csv' | 'viewDevice' | null>(null)
  const [selDevice, setSelDevice] = useState<Device | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [confirmDel, setConfirmDel] = useState<Device | null>(null)
  const [viewHierarchy, setViewHierarchy] = useState(false)

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices', site.id],
    queryFn: () => devicesApi.list({ site_id: site.id, limit: 500 }),
    refetchInterval: 30_000,
  })

  const { data: liveDevice } = useQuery({
    queryKey: ['device', selDevice?.id],
    queryFn: () => devicesApi.get(selDevice!.id),
    enabled: modal === 'viewDevice' && !!selDevice?.id,
    refetchInterval: 15_000,
  })

  const checkMut = useMutation({
    mutationFn: (id: string) => devicesApi.triggerCheck(id),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['devices', site.id] }), 2500),
  })

  const delMut = useMutation({
    mutationFn: (id: string) => devicesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices', site.id] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setConfirmDel(null)
    },
  })

  const nvrs    = devices.filter(d => d.device_type === 'nvr')
  const cameras = devices.filter(d => d.device_type === 'camera')
  const online  = devices.filter(d => d.status === 'online' || d.status === 'degraded').length
  const offline = devices.filter(d => d.status === 'offline').length

  const filtered = devices.filter(d => {
    if (typeFilter && d.device_type !== typeFilter) return false
    if (statusFilter === 'online' && d.status !== 'online' && d.status !== 'degraded') return false
    if (statusFilter && statusFilter !== 'online' && d.status !== statusFilter) return false
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) &&
        !d.ip_address.includes(search)) return false
    return true
  })

  const displayedDevice = liveDevice ?? selDevice

  return (
    <div className="p-6 space-y-5">
      {/* Back + header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={onBack}
            className="text-[11px] text-muted hover:text-text mb-2 flex items-center gap-1 transition-colors">
            ← Back to Sites
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-[16px] font-bold text-text">{displayName}</h1>
            {site.city && <span className="badge-unknown">{site.city}</span>}
          </div>
          {site.address && <div className="text-[11px] text-muted mt-0.5">{site.address}</div>}
        </div>
        {canManage && (
          <button onClick={onEdit} className="btn-ghost text-xs py-1.5 px-3">
            <Pencil size={11} /> Edit Site
          </button>
        )}
      </div>

      {/* Contact info */}
      {(site.contact_name || site.contact_phone || site.contact_email) && (
        <div className="card py-3 px-5 flex items-center gap-8">
          {site.contact_name  && <div><div className="text-[10px] text-muted">Contact</div><div className="text-[12px] text-text">{site.contact_name}</div></div>}
          {site.contact_phone && <div><div className="text-[10px] text-muted">Phone</div><div className="text-[12px] text-text">{site.contact_phone}</div></div>}
          {site.contact_email && <div><div className="text-[10px] text-muted">Email</div><div className="text-[12px] text-text">{site.contact_email}</div></div>}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
        {[
          { label: 'Total Devices',  value: devices.length,  color: 'text-accent' },
          { label: 'Online',         value: online,           color: 'text-success' },
          { label: 'Offline',        value: offline,          color: 'text-danger' },
          { label: 'Total Cameras',  value: cameras.length,   color: 'text-teal' },
          { label: 'Total NVRs',     value: nvrs.length,      color: 'text-purple' },
          { label: 'Uptime',
            value: devices.length ? `${Math.round((online/devices.length)*100)}%` : '—',
            color: online/(devices.length || 1) >= 0.9 ? 'text-success' : 'text-warning' },
        ].map(k => (
          <div key={k.label} className="card py-3 px-4 flex items-center justify-between">
            <div className="text-[10px] text-muted">{k.label}</div>
            <div className={cn('text-lg font-bold tabular-nums', k.color)}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <button
                onClick={() => { setSelDevice(null); setModal('addDevice') }}
                className="btn-primary text-sm py-1.5 px-3"
              >
                <Plus size={13} /> Add Device
              </button>
              <button onClick={() => setModal('csv')} className="btn-teal text-sm py-1.5 px-3">
                <Upload size={12} /> Import CSV
              </button>
            </>
          )}
          <button onClick={() => devicesApi.downloadTemplate()} className="btn-ghost text-xs py-1.5 px-2.5">
            <Download size={11} /> Template
          </button>
          <button
            onClick={() => setViewHierarchy(v => !v)}
            className={cn('btn-ghost text-xs py-1.5 px-2.5', viewHierarchy && 'border-accent text-accent')}
          >
            {viewHierarchy ? 'Table View' : 'Hierarchy'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input pl-7 text-xs py-1.5 w-44" placeholder="Search name, IP…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="select text-xs py-1.5" value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            <option value="camera">Cameras</option>
            <option value="nvr">NVRs</option>
          </select>
          <select className="select text-xs py-1.5" value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
      </div>

      {/* Hierarchy view */}
      {viewHierarchy ? (
        <div className="card">
          <div className="label mb-3">Device Hierarchy</div>
          {isLoading ? <Spinner size="sm" /> : <DeviceHierarchy devices={filtered} />}
        </div>
      ) : (
        /* Table view */
        <div className="card p-0 overflow-x-auto table-scroll">
          {isLoading ? <div className="p-6"><Spinner size="sm" /></div> : (
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface2">
                  {['Status', 'Name', 'Type', 'IP Address', 'Vendor / Model', 'Linked NVR', 'Latency', 'Last Seen', 'Actions'].map(h => (
                    <th key={h} className="table-header px-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center text-muted text-sm">No devices found</td></tr>
                ) : filtered.map(dev => {
                  const linkedNvr = dev.nvr_id ? devices.find(d => d.id === dev.nvr_id) : null
                  return (
                    <tr key={dev.id} className="table-row">
                      <td className="table-cell px-4">
                        <div className="flex items-center gap-2">
                          <StatusDot status={dev.status} />
                          <StatusBadge status={dev.status} />
                        </div>
                      </td>
                      <td className="table-cell px-4 font-medium">
                        <Link to={`/devices/${dev.id}`} className="hover:text-accent transition-colors">
                          {dev.name}
                        </Link>
                      </td>
                      <td className="table-cell px-4">
                        <DeviceTypeBadge type={dev.device_type} />
                      </td>
                      <td className="table-cell px-4 font-mono text-[12px]">{dev.ip_address}</td>
                      <td className="table-cell px-4 text-muted text-[12px] whitespace-nowrap min-w-[160px]">
                        {dev.vendor ? `${dev.vendor}${dev.model ? ' / ' + dev.model : ''}` : '—'}
                      </td>
                      <td className="table-cell px-4 text-[12px]">
                        {linkedNvr
                          ? <span className="badge-nvr">{linkedNvr.name}</span>
                          : <span className="text-muted">—</span>
                        }
                      </td>
                      <td className="table-cell px-4 text-muted text-[12px] font-mono">
                        {formatLatencyWithLoss(dev.latest_ping_latency_ms, dev.latest_ping_packet_loss_pct)}
                      </td>
                      <td className="table-cell px-4 text-muted text-[12px] whitespace-nowrap min-w-[160px]">
                        {dev.last_seen ? formatDate(dev.last_seen) : '—'}
                        {dev.status === 'offline' && dev.downtime_seconds > 0 && (
                          <div className="text-[10px] text-danger mt-0.5">
                            Down {formatDowntime(dev.downtime_seconds)}
                          </div>
                        )}
                        {dev.ping_status && dev.latest_ping_packet_loss_pct !== null && dev.latest_ping_packet_loss_pct !== undefined && dev.latest_ping_packet_loss_pct > 0 && dev.latest_ping_packet_loss_pct < 100 && (
                          <div className="text-[10px] text-warning mt-0.5">
                            Ping warning
                          </div>
                        )}
                      </td>
                      <td className="table-cell px-4">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => navigate(`/devices/${dev.id}`)}
                            className="btn-icon" title="View details"
                          ><Eye size={12} /></button>
                          {canManage && (
                            <>
                              <button
                                onClick={() => { setSelDevice(dev); setModal('editDevice') }}
                                className="btn-icon" title="Edit"
                              ><Pencil size={11} /></button>
                              <button
                                onClick={() => checkMut.mutate(dev.id)}
                                disabled={checkMut.isPending}
                                className="btn-icon text-teal border-teal/30" title="Trigger health check"
                              ><Zap size={11} /></button>
                              <button
                                onClick={() => setConfirmDel(dev)}
                                className="btn-icon text-danger border-danger/25" title="Delete"
                              ><Trash2 size={11} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modals */}
      {canManage && (modal === 'addDevice' || modal === 'editDevice') && (
        <DeviceForm
          siteId={site.id}
          device={modal === 'editDevice' ? selDevice ?? undefined : undefined}
          nvrs={nvrs}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
      {canManage && modal === 'csv' && (
        <CsvImportModal
          siteId={site.id} siteName={site.name}
          onClose={() => setModal(null)}
          onDone={() => setModal(null)}
        />
      )}
      {modal === 'viewDevice' && displayedDevice && (
        <Modal
          title={displayedDevice.name}
          onClose={() => setModal(null)}
          width="max-w-md"
        >
          <div className="flex items-center gap-2 mb-4">
            <StatusDot status={displayedDevice.status} />
            <StatusBadge status={displayedDevice.status} />
            <DeviceTypeBadge type={displayedDevice.device_type} />
            {displayedDevice.vendor && <span className="badge-unknown">{displayedDevice.vendor}</span>}
          </div>
          <InfoRow label="Site" value={site.name} />
          <InfoRow label="IP Address" value={displayedDevice.ip_address} />
          <InfoRow label="HTTP Port" value={String(displayedDevice.port)} />
          <InfoRow label="RTSP Port" value={String(displayedDevice.rtsp_port)} />
          {displayedDevice.device_type === 'nvr' && (
            <>
              <InfoRow label="Total Channels" value={displayedDevice.channel_count !== null && displayedDevice.channel_count !== undefined ? String(displayedDevice.channel_count) : '—'} />
              <InfoRow label="Channels Used" value={displayedDevice.channels_used !== null && displayedDevice.channels_used !== undefined ? String(displayedDevice.channels_used) : '—'} />
            </>
          )}
          <InfoRow label="RTSP Mode" value={displayedDevice.rtsp_mode} />
          <InfoRow label="Stream Type" value={displayedDevice.rtsp_stream_type} />
          <InfoRow label="Model" value={displayedDevice.model} />
          <InfoRow label="Serial No." value={displayedDevice.serial_number} />
          <InfoRow label="Firmware" value={displayedDevice.firmware_version} />
          {displayedDevice.device_type === 'camera' && (
            <InfoRow label="Linked NVR" value={nvrs.find(n => n.id === displayedDevice.nvr_id)?.name ?? 'Standalone'} />
          )}
          {displayedDevice.rtsp_url && (
            <InfoRow label="RTSP URL" value={displayedDevice.rtsp_url} />
          )}
          <InfoRow label="Last Seen" value={displayedDevice.last_seen ? formatDate(displayedDevice.last_seen) : '—'} />
          {displayedDevice.downtime_seconds > 0 && (
            <InfoRow label="Total Downtime" value={formatDowntime(displayedDevice.downtime_seconds)} />
          )}
          {displayedDevice.notes && <InfoRow label="Notes" value={displayedDevice.notes} />}

          {/* Health status */}
          <div className="mt-4">
            <div className="label">Health Checks</div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              {[
                { label: 'Ping',  val: displayedDevice.ping_status, packetLoss: displayedDevice.latest_ping_packet_loss_pct },
                ...(displayedDevice.rtsp_mode !== 'disabled' ? [{ label: 'RTSP', val: displayedDevice.rtsp_status }] : []),
                ...(displayedDevice.device_type === 'nvr' ? [{ label: 'API', val: displayedDevice.api_status }] : []),
              ].map(c => (
                <div key={c.label} className="bg-surface2 rounded p-2 text-center border border-border">
                  <div className="text-[10px] text-muted mb-1">{c.label}</div>
                  {c.label === 'Ping'
                    ? (() => {
                        const pingState = pingStateLabel(c.val as boolean | null | undefined, (c as any).packetLoss)
                        return <span className={pingState.className}>{pingState.label}</span>
                      })()
                    : c.val === null || c.val === undefined
                    ? <span className="badge-unknown">—</span>
                    : <span className={c.val ? 'badge-online' : 'badge-offline'}>{c.val ? 'Pass' : 'Fail'}</span>
                  }
                </div>
              ))}
              <div className="bg-surface2 rounded p-2 text-center border border-border">
                <div className="text-[10px] text-muted mb-1">Latency</div>
                <span className="text-[12px] text-text font-mono">
                  {formatLatencyWithLoss(displayedDevice.latest_ping_latency_ms, displayedDevice.latest_ping_packet_loss_pct)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <button className="btn-ghost" onClick={() => setModal(null)}>Close</button>
            {canManage && (
              <button className="btn-teal"
                onClick={() => { setModal(null); setTimeout(() => { setModal('editDevice') }, 50) }}>
                Edit Device
              </button>
            )}
          </div>
        </Modal>
      )}
      {canManage && confirmDel && (
        <ConfirmDialog
          title="Delete Device"
          message={`Are you sure you want to delete "${confirmDel.name}"? This action cannot be undone.`}
          onConfirm={() => delMut.mutate(confirmDel.id)}
          onCancel={() => setConfirmDel(null)}
          confirmLabel="Delete Device"
          loading={delMut.isPending}
        />
      )}
    </div>
  )
}

// ─── Sites List ───────────────────────────────────────────────────────────────
export default function SitesPage() {
  const qc = useQueryClient()
  const user = useAuthStore(state => state.user)
  const canManage = isAdminUser(user)
  const [selSite, setSelSite] = useState<Site | null>(null)
  const [modal, setModal] = useState<{ open: boolean; site?: Site }>({ open: false })
  const [importOpen, setImportOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState<Site | null>(null)
  const [siteSearch, setSiteSearch] = useState('')
  const [siteSort, setSiteSort] = useState<'name' | 'city' | 'uptime' | 'total'>('city')
  const [siteStatusFilter, setSiteStatusFilter] = useState<'' | 'offline' | 'online' | 'degraded' | 'no_devices'>('')
  const listScrollY = useRef(0)
  const shouldRestoreScroll = useRef(false)

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: sitesApi.list,
    refetchInterval: 60_000,
  })

  const delMut = useMutation({
    mutationFn: (id: string) => sitesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sites'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['alerts'] })
      setConfirmDel(null)
      setSelSite(null)
    },
  })

  const filteredSites = useMemo(() => {
    const query = siteSearch.trim().toLowerCase()
    const list = sites.filter(site => {
      const total = site.total_devices ?? 0
      const online = (site.online_devices ?? 0) + (site.degraded_devices ?? 0)
      const degraded = site.degraded_devices ?? 0
      const offline = site.offline_devices ?? 0

      if (siteStatusFilter === 'offline' && offline <= 0) return false
      if (siteStatusFilter === 'online' && total > 0 && offline > 0) return false
      if (siteStatusFilter === 'online' && total <= 0) return false
      if (siteStatusFilter === 'degraded' && degraded <= 0) return false
      if (siteStatusFilter === 'no_devices' && total > 0) return false
      if (!query) return true
      const haystack = [
        site.name,
        site.city,
        site.address,
        site.contact_name,
        site.contact_phone,
        site.contact_email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })

    const uptimePct = (site: Site) => {
      const total = site.total_devices ?? 0
      const online = site.online_devices ?? 0
      return total > 0 ? online / total : 0
    }

    return [...list].sort((a, b) => {
      switch (siteSort) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'city':
          return (a.city || 'Other').localeCompare(b.city || 'Other') || a.name.localeCompare(b.name)
        case 'uptime':
          return uptimePct(b) - uptimePct(a) || a.name.localeCompare(b.name)
        case 'total':
          return (b.total_devices ?? 0) - (a.total_devices ?? 0) || a.name.localeCompare(b.name)
        default:
          return a.name.localeCompare(b.name)
      }
    })
  }, [sites, siteSearch, siteSort, siteStatusFilter])

  const siteGroups = useMemo(() => {
    const groups = new Map<string, Site[]>()
    filteredSites.forEach(site => {
      const key = (site.city || 'Other Locations').trim() || 'Other Locations'
      const existing = groups.get(key) ?? []
      existing.push(site)
      groups.set(key, existing)
    })
    return Array.from(groups.entries())
  }, [filteredSites])

  useEffect(() => {
    if (!selSite && shouldRestoreScroll.current) {
      shouldRestoreScroll.current = false
      requestAnimationFrame(() => {
        const container = appScrollContainer()
        if (container) {
          container.scrollTo({ top: listScrollY.current, behavior: 'auto' })
        } else {
          window.scrollTo({ top: listScrollY.current, behavior: 'auto' })
        }
      })
    }
  }, [selSite])

  // If a site is selected, show its detail page
  if (selSite) {
    const fresh = sites.find(s => s.id === selSite.id) ?? selSite
    return (
      <>
        <SiteDetail
          site={fresh}
          canManage={canManage}
          onBack={() => {
            setModal({ open: false })
            shouldRestoreScroll.current = true
            setSelSite(null)
          }}
          onEdit={() => {
            if (canManage) setModal({ open: true, site: fresh })
          }}
        />
        {canManage && modal.open && (
          <SiteForm
            site={modal.site}
            onClose={() => setModal({ open: false })}
            onSaved={() => setModal({ open: false })}
          />
        )}
      </>
    )
  }

  return (
    <div className="p-6">
      <PageHeader
        title={`Sites (${sites.length})`}
        subtitle={canManage ? 'Click a site to manage its devices' : 'Click a site to view its devices'}
        actions={canManage ? (
          <>
            <button onClick={() => setImportOpen(true)} className="btn-teal">
              <Upload size={13} /> Import CSV
            </button>
            <button onClick={() => setModal({ open: true })} className="btn-primary">
              <Plus size={13} /> Add Site
            </button>
          </>
        ) : undefined}
      />

      {isLoading ? <Spinner /> : sites.length === 0 ? (
        <EmptyState message="No sites configured. Create a site to start adding cameras and NVRs." />
      ) : (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  className="input pl-9"
                  placeholder="Search by site, city, address, contact, email or phone"
                  value={siteSearch}
                  onChange={e => setSiteSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted whitespace-nowrap">Filter</span>
                <select
                  className="select min-w-[170px]"
                  value={siteStatusFilter}
                  onChange={e => setSiteStatusFilter(e.target.value as typeof siteStatusFilter)}
                  >
                    <option value="">All sites</option>
                    <option value="offline">Sites with offline devices</option>
                    <option value="online">Fully online sites</option>
                    <option value="degraded">Sites with degraded devices</option>
                    <option value="no_devices">No devices</option>
                  </select>
                </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted whitespace-nowrap">Sort by</span>
                <select
                  className="select min-w-[170px]"
                  value={siteSort}
                  onChange={e => setSiteSort(e.target.value as typeof siteSort)}
                >
                  <option value="city">City</option>
                  <option value="name">Site name</option>
                  <option value="uptime">Uptime</option>
                  <option value="total">Total devices</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-muted">
              <span>Showing <span className="text-text font-medium">{filteredSites.length}</span> of <span className="text-text font-medium">{sites.length}</span> sites</span>
              <span>{siteGroups.length} city group{siteGroups.length === 1 ? '' : 's'}</span>
            </div>
          </div>

          {filteredSites.length === 0 ? (
            <EmptyState message="No sites match your search." />
          ) : (
            <div className="space-y-5">
              {siteGroups.map(([city, groupSites]) => (
                <section key={city} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div>
                      <h3 className="text-sm font-semibold text-text">{city}</h3>
                      <div className="text-xs text-muted">{groupSites.length} site{groupSites.length === 1 ? '' : 's'}</div>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {groupSites.map(site => {
                      const total = site.total_devices ?? 0
                      const degraded = site.degraded_devices ?? 0
                      const online = (site.online_devices ?? 0) + degraded
                      const offline = site.offline_devices ?? 0
                      const pct = total > 0 ? Math.round((online / total) * 100) : 0
                      const pctCol = pct >= 90 ? 'text-success' : pct >= 60 ? 'text-warning' : 'text-danger'
                      const displayName = stripCityFromDisplayName(site.name, site.city)

                      return (
                        <div
                          key={site.id}
                          className="card hover:border-border2 transition-colors cursor-pointer"
                          onClick={() => {
                            const container = appScrollContainer()
                            listScrollY.current = container ? container.scrollTop : window.scrollY
                            setSelSite(site)
                          }}
                        >
                          <div className="flex flex-col xl:flex-row xl:items-center gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                <span className="text-[15px] font-semibold text-text">{displayName}</span>
                                {site.city && <span className="badge-unknown">{site.city}</span>}
                                {degraded > 0 && <span className="badge-degraded">{degraded} degraded</span>}
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11px] text-muted">
                                {site.contact_name && (
                                  <span>{site.contact_name}{site.contact_phone ? ` · ${site.contact_phone}` : ''}</span>
                                )}
                                {site.contact_email && <span>{site.contact_email}</span>}
                              </div>
                            </div>

                              <div className="flex flex-col sm:flex-row sm:items-center gap-4 xl:gap-6 shrink-0">
                               <div className="grid grid-cols-3 gap-3 min-w-[220px]">
                                  {[
                                    { label: 'Total', value: total, color: 'text-text' },
                                    { label: 'Online', value: online, color: 'text-success' },
                                    { label: 'Offline', value: offline, color: 'text-danger' },
                                  ].map(k => (
                                  <div key={k.label} className="rounded-lg border border-border bg-surface2/40 px-3 py-2 text-center">
                                    <div className={cn('text-[17px] font-semibold tabular-nums', k.color)}>{k.value}</div>
                                    <div className="text-[10px] text-muted">{k.label}</div>
                                  </div>
                                ))}
                              </div>

                              <div className="w-full sm:w-32">
                                <div className="flex justify-between text-[10px] mb-1">
                                  <span className="text-muted">Uptime</span>
                                  <span className={cn('font-semibold', pctCol)}>{pct}%</span>
                                </div>
                                <ProgressBar value={online} max={total} />
                              </div>

                              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                {canManage && (
                                  <>
                                    <button
                                      onClick={() => setModal({ open: true, site })}
                                      className="btn-icon"
                                      title="Edit site"
                                    ><Pencil size={12} /></button>
                                    <button
                                      onClick={() => setConfirmDel(site)}
                                      className="btn-icon text-danger border-danger/25"
                                      title="Delete site"
                                    ><Trash2 size={12} /></button>
                                  </>
                                )}
                                <ChevronRight size={16} className="text-muted ml-1" />
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {canManage && modal.open && (
        <SiteForm
          site={modal.site}
          onClose={() => setModal({ open: false })}
          onSaved={() => setModal({ open: false })}
        />
      )}
      {canManage && importOpen && (
        <CsvImportModal
          onClose={() => setImportOpen(false)}
          onDone={() => setImportOpen(false)}
        />
      )}
      {canManage && confirmDel && (
        <ConfirmDialog
          title="Delete Site"
          message={`Are you sure you want to delete "${confirmDel.name}"? This will remove the site from active views, deactivate its devices, and close active alerts for those devices.`}
          onConfirm={() => delMut.mutate(confirmDel.id)}
          onCancel={() => setConfirmDel(null)}
          confirmLabel="Delete Site"
          loading={delMut.isPending}
        />
      )}
    </div>
  )
}



