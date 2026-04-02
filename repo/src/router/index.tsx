import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/Layout/AppShell.tsx'
import { useAuth } from '../hooks/useAuth.ts'
import { ProtectedRoute } from './ProtectedRoute.tsx'

const LoginPage = lazy(() => import('../pages/LoginPage.tsx'))
const DashboardPage = lazy(() => import('../pages/DashboardPage.tsx'))
const FishListPage = lazy(() => import('../pages/FishListPage.tsx'))
const FishDetailPage = lazy(() => import('../pages/FishDetailPage.tsx'))
const FishEditPage = lazy(() => import('../pages/FishEditPage.tsx'))
const CampaignListPage = lazy(() => import('../pages/CampaignListPage.tsx'))
const CampaignDetailPage = lazy(() => import('../pages/CampaignDetailPage.tsx'))
const DispatchBoardPage = lazy(() => import('../pages/DispatchBoardPage.tsx'))
const CourseListPage = lazy(() => import('../pages/CourseListPage.tsx'))
const CourseDetailPage = lazy(() => import('../pages/CourseDetailPage.tsx'))
const FinancePage = lazy(() => import('../pages/FinancePage.tsx'))
const NotificationsPage = lazy(() => import('../pages/NotificationsPage.tsx'))
const AdminPage = lazy(() => import('../pages/AdminPage.tsx'))
const BootstrapSetupPage = lazy(() => import('../pages/BootstrapSetupPage.tsx'))

function Loading() {
  return <div className="page">Loading...</div>
}

function LoginRoute() {
  const { currentUser, isReady } = useAuth()
  if (!isReady) {
    return <Loading />
  }

  if (currentUser) {
    return <Navigate to="/dashboard" replace />
  }

  return <LoginPage />
}

export function AppRouter() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />

          <Route path="fish" element={<FishListPage />} />
          <Route path="fish/:id" element={<FishDetailPage />} />
          <Route
            path="fish/new"
            element={
              <ProtectedRoute roles={['ContentEditor', 'Administrator']}>
                <FishEditPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="campaigns"
            element={
              <ProtectedRoute roles={['Member', 'Administrator']}>
                <CampaignListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="campaigns/:id"
            element={
              <ProtectedRoute roles={['Member', 'Administrator']}>
                <CampaignDetailPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="dispatch"
            element={
              <ProtectedRoute roles={['Dispatcher', 'Administrator']}>
                <DispatchBoardPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="courses"
            element={
              <ProtectedRoute roles={['Instructor', 'Member', 'Administrator']}>
                <CourseListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="courses/:id"
            element={
              <ProtectedRoute roles={['Instructor', 'Member', 'Administrator']}>
                <CourseDetailPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="finance"
            element={
              <ProtectedRoute roles={['FinanceClerk', 'Administrator']}>
                <FinancePage />
              </ProtectedRoute>
            }
          />

          <Route path="notifications" element={<NotificationsPage />} />

          <Route
            path="admin"
            element={
              <ProtectedRoute roles={['Administrator']}>
                <AdminPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route
          path="bootstrap-setup"
          element={
            <ProtectedRoute>
              <BootstrapSetupPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
