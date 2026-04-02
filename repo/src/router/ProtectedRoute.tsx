import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.ts'
import type { UserRole } from '../types/index.ts'
import ForbiddenPage from '../pages/ForbiddenPage.tsx'

interface ProtectedRouteProps {
  children: ReactNode
  roles?: UserRole[]
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const location = useLocation()
  const { currentUser, isReady } = useAuth()

  if (!isReady) {
    return <div className="page">Loading...</div>
  }

  if (!currentUser) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          returnTo: location.pathname + location.search,
        }}
      />
    )
  }

  // Force password setup on every protected route until complete.
  // The /bootstrap-setup path itself is exempt to avoid a redirect loop.
  if (currentUser.mustChangePassword && location.pathname !== '/bootstrap-setup') {
    return <Navigate to="/bootstrap-setup" replace />
  }

  if (roles && roles.length > 0 && !roles.includes(currentUser.role)) {
    return <ForbiddenPage />
  }

  return <>{children}</>
}
