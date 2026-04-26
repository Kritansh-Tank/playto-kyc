import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import KYCPage from './pages/KYCPage'
import ReviewerDashboard from './pages/ReviewerDashboard'
import SubmissionDetail from './pages/SubmissionDetail'

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-slate-400">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role)
    return <Navigate to={user.role === 'reviewer' ? '/reviewer' : '/kyc'} replace />
  return children
}

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'reviewer' ? '/reviewer' : '/kyc'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/kyc"
            element={
              <ProtectedRoute role="merchant">
                <KYCPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reviewer"
            element={
              <ProtectedRoute role="reviewer">
                <ReviewerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reviewer/:id"
            element={
              <ProtectedRoute role="reviewer">
                <SubmissionDetail />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
