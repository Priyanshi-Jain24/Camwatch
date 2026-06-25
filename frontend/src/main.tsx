import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import './index.css'
import { AppLayout }   from './components/layout/AppLayout'
import { Spinner } from './components/shared'
import LoginPage       from './pages/auth/LoginPage'
import DashboardPage   from './pages/dashboard/DashboardPage'
import SitesPage       from './pages/sites/SitesPage'
import DevicesPage     from './pages/devices/DevicesPage'
import DeviceHealthPage from './pages/devices/DeviceHealthPage'
import AlertsPage      from './pages/alerts/AlertsPage'
import ReportsPage     from './pages/reports/ReportsPage'
import { useAuthStore } from './store/auth'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, user, isLoading, loadUser } = useAuthStore()
  useEffect(() => { loadUser() }, [loadUser])
  if (token && !user && isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-bg"><Spinner /></div>
  }
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }>
            <Route index          element={<DashboardPage />} />
            <Route path="sites"   element={<SitesPage />} />
            <Route path="devices" element={<DevicesPage />} />
            <Route path="devices/:id" element={<DeviceHealthPage />} />
            <Route path="alerts"  element={<AlertsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            {/* cameras/nvrs now resolve to the flat Devices list, pre-filtered by type */}
            <Route path="cameras" element={<Navigate to="/devices?type=camera" replace />} />
            <Route path="nvrs"    element={<Navigate to="/devices?type=nvr" replace />} />
            <Route path="cameras/:id" element={<DeviceHealthPage />} />
            <Route path="nvrs/:id" element={<DeviceHealthPage />} />
            <Route path="import"  element={<Navigate to="/sites" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
)
