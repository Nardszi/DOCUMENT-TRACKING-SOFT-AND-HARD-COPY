import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { NotificationProvider } from './contexts/NotificationContext'
import AuthGuard from './components/AuthGuard'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AdminPage from './pages/AdminPage'
import DocumentCreatePage from './pages/DocumentCreatePage'
import DocumentEditPage from './pages/DocumentEditPage'
import DocumentListPage from './pages/DocumentListPage'
import DocumentDetailPage from './pages/DocumentDetailPage'
import NotificationsPage from './pages/NotificationsPage'
import ProfilePage from './pages/ProfilePage'
import ReportsPage from './pages/ReportsPage'
import AuditLogPage from './pages/AuditLogPage'
import { ToastProvider } from './components/ToastContainer'
import OfflineIndicator from './components/OfflineIndicator'

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <Layout>{children}</Layout>
    </AuthGuard>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <ToastProvider>
          <OfflineIndicator />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<AuthenticatedLayout><DashboardPage /></AuthenticatedLayout>} />
            <Route path="/admin" element={<AuthenticatedLayout><AdminPage /></AuthenticatedLayout>} />
            <Route path="/documents/new" element={<AuthenticatedLayout><DocumentCreatePage /></AuthenticatedLayout>} />
            <Route path="/documents/:id/edit" element={<AuthenticatedLayout><DocumentEditPage /></AuthenticatedLayout>} />
            <Route path="/documents" element={<AuthenticatedLayout><DocumentListPage /></AuthenticatedLayout>} />
            <Route path="/documents/:id" element={<AuthenticatedLayout><DocumentDetailPage /></AuthenticatedLayout>} />
            <Route path="/notifications" element={<AuthenticatedLayout><NotificationsPage /></AuthenticatedLayout>} />
            <Route path="/profile" element={<AuthenticatedLayout><ProfilePage /></AuthenticatedLayout>} />
            <Route path="/reports" element={<AuthenticatedLayout><ReportsPage /></AuthenticatedLayout>} />
            <Route path="/audit-log" element={<AuthenticatedLayout><AuditLogPage /></AuthenticatedLayout>} />
            <Route path="/admin/audit-log" element={<AuthenticatedLayout><AuditLogPage /></AuthenticatedLayout>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ToastProvider>
        </NotificationProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
