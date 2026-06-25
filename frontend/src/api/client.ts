import axios from 'axios'

// Base URL is build-time configurable via VITE_API_URL.
// - Production (Vercel): no override needed — defaults to the absolute Render
//   backend URL, since frontend and backend are different origins.
// - Local docker: the frontend Dockerfile sets VITE_API_URL=/api/v1 so the
//   browser calls the same origin and nginx proxies it to the API container.
const api = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_URL || 'https://camwatch-api.onrender.com/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const path = String(err.config?.url || '')
    const isAuthCheck = path.includes('/auth/me')
    const isLoginRequest = path.includes('/auth/login') || path.includes('/auth/google/login')

    if (err.response?.status === 401 && isAuthCheck && !isLoginRequest) {
      localStorage.removeItem('access_token')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
