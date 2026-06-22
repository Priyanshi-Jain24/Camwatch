import { useState, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { devicesApi } from '@/api'
import { apiErrorMessage, formatDate } from '@/utils'
import { PageHeader, Spinner } from '@/components/shared'
import { useDropzone } from 'react-dropzone'
import { Upload, Download, CheckCircle, XCircle, FileText } from 'lucide-react'
import type { ImportLog } from '@/types'

export default function ImportPage() {
  const [result, setResult] = useState<ImportLog | null>(null)
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const { data: history = [], isLoading, refetch } = useQuery({
    queryKey: ['import-history'],
    queryFn: devicesApi.importHistory,
  })

  const importMut = useMutation({
    mutationFn: (file: File) => devicesApi.importCsv(file),
    onSuccess: (data) => {
      setResult(data)
      setUploading(false)
      if (data.errors) {
        try { setErrors(JSON.parse(data.errors)) } catch { setErrors([data.errors]) }
      }
      refetch()
    },
    onError: (e: any) => {
      setUploading(false)
      setErrors([apiErrorMessage(e, 'Upload failed')])
    },
  })

  const onDrop = useCallback((accepted: File[]) => {
    if (!accepted[0]) return
    setResult(null)
    setErrors([])
    setUploading(true)
    importMut.mutate(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  })

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="CSV Import"
        actions={
          <button onClick={devicesApi.downloadTemplate} className="btn-ghost flex items-center gap-1.5 text-xs">
            <Download size={12} /> Download Template
          </button>
        }
      />

      <div className="card mb-5">
        <div className="label">Required Columns</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {['site_name *', 'device_name *', 'device_type *', 'ip_address *', 'username', 'password', 'rtsp_url', 'vendor', 'model'].map(col => (
            <span key={col} className={col.includes('*') ? 'badge-medium' : 'badge-unknown'}>{col}</span>
          ))}
        </div>
        <div className="text-[11px] text-muted">
          device_type must be <code className="bg-surface2 px-1 rounded">camera</code> or <code className="bg-surface2 px-1 rounded">nvr</code>.
          Sites are auto-created if they don't exist.
        </div>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors mb-5 ${
          isDragActive ? 'border-accent bg-accent/5' : 'border-border hover:border-border2'
        }`}
      >
        <input {...getInputProps()} />
        <Upload size={24} className="mx-auto mb-3 text-muted" />
        {uploading
          ? <div className="text-sm text-muted">Uploading…</div>
          : isDragActive
            ? <div className="text-sm text-accent">Drop CSV here</div>
            : <div>
                <div className="text-sm text-text mb-1">Drag & drop a CSV file, or click to browse</div>
                <div className="text-[11px] text-muted">Only .csv files accepted</div>
              </div>
        }
      </div>

      {/* Result */}
      {result && (
        <div className={`card mb-5 border-l-2 ${result.failed_rows === 0 ? 'border-l-success' : 'border-l-warning'}`}>
          <div className="flex items-center gap-3 mb-3">
            {result.failed_rows === 0
              ? <CheckCircle size={16} className="text-success" />
              : <XCircle size={16} className="text-warning" />
            }
            <span className="text-[13px] font-medium">
              Import Complete — {result.success_rows}/{result.total_rows} rows succeeded
            </span>
          </div>
          <div className="flex gap-6 text-[12px]">
            <span className="text-success">✓ {result.success_rows} imported</span>
            <span className="text-danger">✗ {result.failed_rows} failed</span>
          </div>
          {errors.length > 0 && (
            <div className="mt-3 max-h-32 overflow-y-auto">
              {errors.map((e, i) => (
                <div key={i} className="text-[11px] text-danger mb-0.5">{e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div className="card">
        <div className="label">Import History</div>
        {isLoading ? <Spinner /> : history.length === 0 ? (
          <div className="text-muted text-sm">No import history</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['File', 'Total', 'Success', 'Failed', 'Date'].map(h => (
                  <th key={h} className="text-left text-[11px] text-muted font-medium pb-2 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} className="border-b border-border/40">
                  <td className="py-2 pr-4 text-[12px] flex items-center gap-1.5">
                    <FileText size={11} className="text-muted" />
                    {h.filename || '—'}
                  </td>
                  <td className="py-2 pr-4 text-[12px]">{h.total_rows}</td>
                  <td className="py-2 pr-4 text-[12px] text-success">{h.success_rows}</td>
                  <td className="py-2 pr-4 text-[12px] text-danger">{h.failed_rows}</td>
                  <td className="py-2 text-[12px] text-muted">{formatDate(h.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
