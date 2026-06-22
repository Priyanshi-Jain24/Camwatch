import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import './index.css'
import { AppLayout }   from './components/layout/AppLayout'
import LoginPage       from './pages/auth/LoginPage'
import DashboardPage   from './pages/dashboard/DashboardPage'
import SitesPage       from './pages/sites/SitesPage'
import AlertsPage      from './pages/alerts/AlertsPage'
import ReportsPage     from './pages/reports/ReportsPage'
import { useAuthStore } from './store/auth'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loadUser } = useAuthStore()
  useEffect(() => { if (token) loadUser() }, [])
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
            <Route path="alerts"  element={<AlertsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            {/* Legacy redirects — cameras/nvrs/import now live inside Sites */}
            <Route path="cameras" element={<Navigate to="/sites" replace />} />
            <Route path="nvrs"    element={<Navigate to="/sites" replace />} />
            <Route path="import"  element={<Navigate to="/sites" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
)
