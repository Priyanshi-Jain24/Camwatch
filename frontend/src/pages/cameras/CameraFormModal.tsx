import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { devicesApi } from '@/api'
import type { Site, Device } from '@/types'
import { Eye, EyeOff, X } from 'lucide-react'
import { apiErrorMessage, generateRtspUrl } from '@/utils'

interface Props {
  sites: Site[]
  device?: Device
  onClose: () => void
  onSaved: () => void
}

export default function CameraFormModal({ sites, device, onClose, onSaved }: Props) {
  const isEdit = !!device
  const [form, setForm] = useState({
    name: device?.name ?? '',
    site_id: device?.site_id ?? (sites[0]?.id ?? ''),
    ip_address: device?.ip_address ?? '',
    port: device?.port ?? 80,
    rtsp_port: device?.rtsp_port ?? 554,
    username: device?.username ?? '',
    password: device?.password ?? '',
    rtsp_mode: device?.rtsp_mode ?? 'auto',
    rtsp_stream_type: device?.rtsp_stream_type ?? 'main',
    rtsp_url: device?.rtsp_url ?? '',
    vendor: device?.vendor ?? '',
    model: device?.model ?? '',
    serial_number: device?.serial_number ?? '',
    firmware_version: device?.firmware_version ?? '',
    notes: device?.notes ?? '',
  })
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const generatedRtspUrl = generateRtspUrl(
    form.vendor,
    form.ip_address,
    form.rtsp_port,
    form.username,
    form.password,
    form.rtsp_stream_type,
    'camera',
  )

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  const save = () => {
    if (!String(form.name).trim()) {
      setError('Camera name is required')
      return
    }
    if (!String(form.ip_address).trim()) {
      setError('IP address is required')
      return
    }
    setError('')
    mut.mutate()
  }

  const mut = useMutation({
    mutationFn: isEdit
      ? () => devicesApi.update(device!.id, { ...form, device_type: 'camera' })
      : () => devicesApi.create({ ...form, device_type: 'camera' }),
    onSuccess: onSaved,
    onError: (e: any) => setError(apiErrorMessage(e, 'Save failed')),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">{isEdit ? 'Edit Camera' : 'Add Camera'}</h2>
          <button onClick={onClose}><X size={15} className="text-muted hover:text-text" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted block mb-1.5">Name *</label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Site *</label>
              <select className="select w-full" value={form.site_id} onChange={e => set('site_id', e.target.value)}>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">IP Address *</label>
              <input className="input font-mono" value={form.ip_address} onChange={e => set('ip_address', e.target.value)} placeholder="192.168.1.101" />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Port</label>
              <input className="input font-mono" type="number" value={form.port} onChange={e => set('port', +e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">RTSP Port</label>
              <input className="input font-mono" type="number" value={form.rtsp_port} onChange={e => set('rtsp_port', +e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Username</label>
              <input className="input" value={form.username} onChange={e => set('username', e.target.value)} placeholder="admin" />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Password</label>
              <div className="relative">
                <input
                  className="input pr-9"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                />
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
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">RTSP URL</label>
            <input
              className="input font-mono text-xs"
              value={form.rtsp_url}
              onChange={e => set('rtsp_url', e.target.value)}
              placeholder={generatedRtspUrl || 'rtsp://192.168.1.101/stream1'}
            />
            {generatedRtspUrl && !form.rtsp_url && (
              <div className="text-[10px] text-muted mt-1">Auto: {generatedRtspUrl}</div>
            )}
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-muted block mb-1.5">Vendor</label>
              <select className="select w-full" value={form.vendor} onChange={e => set('vendor', e.target.value)}>
                <option value="">Select vendor</option>
                <option value="Hikvision">Hikvision</option>
                <option value="Dahua">Dahua</option>
                <option value="UNV">Uniview / UNV</option>
                <option value="CP Plus">CP Plus</option>
                <option value="Axis">Axis</option>
                <option value="Generic">Generic</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Stream Type</label>
              <select className="select w-full" value={form.rtsp_stream_type} onChange={e => set('rtsp_stream_type', e.target.value)}>
                <option value="main">Main Stream</option>
                <option value="sub">Sub Stream</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Model</label>
              <input className="input" value={form.model} onChange={e => set('model', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Serial No.</label>
              <input className="input" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">Notes</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          {error && <div className="text-danger text-xs">{error}</div>}
          <div className="flex gap-3 justify-end pt-1">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={mut.isPending}>
              {mut.isPending ? 'Saving…' : isEdit ? 'Update' : 'Add Camera'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
