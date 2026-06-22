import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun, Video } from 'lucide-react'

import { authApi } from '@/api'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'

declare global {
  interface Window {
    google?: any
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('admin@camwatch.com')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const googleButtonRef = useRef<HTMLDivElement | null>(null)
  const { login, loginWithGoogle } = useAuthStore()
  const { theme, toggle } = useThemeStore()
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    const loadGoogle = async () => {
      try {
        const config = await authApi.googleConfig()
        if (!config.enabled || !config.client_id) {
          if (!cancelled) setGoogleEnabled(false)
          return
        }

        if (!cancelled) setGoogleEnabled(true)

        await new Promise<void>((resolve, reject) => {
          if (window.google?.accounts?.id) {
            resolve()
            return
          }
          const existing = document.querySelector('script[data-google-identity="true"]') as HTMLScriptElement | null
          if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true })
            existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity script')), { once: true })
            return
          }

          const script = document.createElement('script')
          script.src = 'https://accounts.google.com/gsi/client'
          script.async = true
          script.defer = true
          script.dataset.googleIdentity = 'true'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Failed to load Google Identity script'))
          document.head.appendChild(script)
        })

        if (cancelled || !googleButtonRef.current || !window.google?.accounts?.id) return

        window.google.accounts.id.initialize({
          client_id: config.client_id,
          callback: async (response: { credential?: string }) => {
            if (!response.credential) {
              setError('Google sign-in did not return a credential')
              return
            }
            setError('')
            setLoading(true)
            try {
              await loginWithGoogle(response.credential)
              navigate('/')
            } catch (err: any) {
              setError(err?.response?.data?.detail || 'Google sign-in failed')
            } finally {
              setLoading(false)
            }
          },
        })

        googleButtonRef.current.innerHTML = ''
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 320,
        })
      } catch (err: any) {
        if (!cancelled) {
          setGoogleEnabled(false)
          setError(prev => prev || err?.message || 'Failed to load Google sign-in')
        }
      }
    }

    loadGoogle()
    return () => {
      cancelled = true
    }
  }, [loginWithGoogle, navigate, theme])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err: any) {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail
      if (status === 401) {
        setError(detail || 'Invalid email or password')
      } else if (status === 502 || !err?.response) {
        setError('Server is starting or unavailable. Please try again in a few seconds.')
      } else {
        setError(detail || 'Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <button
        onClick={toggle}
        className="fixed top-4 right-4 p-2 rounded-lg bg-surface border border-border text-muted hover:text-text transition-colors"
      >
        {theme === 'dark'
          ? <Sun size={14} className="text-warning" />
          : <Moon size={14} className="text-accent" />}
      </button>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 mb-4">
            <Video size={22} className="text-accent" />
          </div>
          <div className="text-[18px] font-bold text-text tracking-wide">CAMWATCH</div>
          <div className="text-[12px] text-muted mt-1">CCTV and NVR Monitoring Platform</div>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">Email Address</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="admin@camwatch.com"
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Enter password"
              />
            </div>
            {error && (
              <div className="text-danger text-xs bg-danger/5 border border-danger/20 rounded px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {googleEnabled && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-[11px] text-muted text-center mb-3">Or continue with Google</div>
              <div className="flex justify-center">
                <div ref={googleButtonRef} />
              </div>
            </div>
          )}
        </div>

        <div className="text-center text-[10px] text-muted mt-5">
          CamWatch | CCTV Monitoring Platform
        </div>
      </div>
    </div>
  )
}
