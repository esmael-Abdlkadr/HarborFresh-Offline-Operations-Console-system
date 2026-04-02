// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '../router/ProtectedRoute.tsx'
import type { User } from '../types/index.ts'

const useAuthMock = vi.fn()

vi.mock('../hooks/useAuth.ts', () => ({
  useAuth: () => useAuthMock(),
}))

// ForbiddenPage is imported by ProtectedRoute; stub it out
vi.mock('../pages/ForbiddenPage.tsx', () => ({
  default: () => <div>Forbidden</div>,
}))

function ready(user: Partial<User> | null) {
  useAuthMock.mockReturnValue({
    currentUser: user,
    isReady: true,
    hasRole: () => true,
  })
}

function renderRoute(initialPath: string, routePath: string, roles?: string[]) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path={routePath}
          element={
            <ProtectedRoute roles={roles as never}>
              <div>Protected content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/bootstrap-setup" element={<div>Bootstrap setup page</div>} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProtectedRoute – bootstrap gate', () => {
  it('redirects to /bootstrap-setup when mustChangePassword is true', () => {
    ready({ id: 1, username: 'admin', role: 'Administrator', mustChangePassword: true, failedAttempts: 0, passwordHash: '', salt: '' })
    renderRoute('/dashboard', '/dashboard')
    expect(screen.getByText('Bootstrap setup page')).toBeTruthy()
    expect(screen.queryByText('Protected content')).toBeNull()
  })

  it('does NOT redirect when on /bootstrap-setup even if mustChangePassword is true', () => {
    ready({ id: 1, username: 'admin', role: 'Administrator', mustChangePassword: true, failedAttempts: 0, passwordHash: '', salt: '' })
    renderRoute('/bootstrap-setup', '/bootstrap-setup')
    expect(screen.getByText('Protected content')).toBeTruthy()
    expect(screen.queryByText('Bootstrap setup page')).toBeNull()
  })

  it('allows through when mustChangePassword is false', () => {
    ready({ id: 1, username: 'admin', role: 'Administrator', mustChangePassword: false, failedAttempts: 0, passwordHash: '', salt: '' })
    renderRoute('/dashboard', '/dashboard')
    expect(screen.getByText('Protected content')).toBeTruthy()
  })

  it('allows through when mustChangePassword is undefined', () => {
    ready({ id: 1, username: 'member', role: 'Member', failedAttempts: 0, passwordHash: '', salt: '' })
    renderRoute('/dashboard', '/dashboard')
    expect(screen.getByText('Protected content')).toBeTruthy()
  })

  it('redirects unauthenticated user to /login', () => {
    ready(null)
    renderRoute('/dashboard', '/dashboard')
    expect(screen.getByText('Login page')).toBeTruthy()
    expect(screen.queryByText('Protected content')).toBeNull()
  })

  it('shows Forbidden for wrong role', () => {
    useAuthMock.mockReturnValue({
      currentUser: { id: 2, username: 'member', role: 'Member', mustChangePassword: false, failedAttempts: 0, passwordHash: '', salt: '' },
      isReady: true,
      hasRole: () => false,
    })
    renderRoute('/admin', '/admin', ['Administrator'])
    expect(screen.getByText('Forbidden')).toBeTruthy()
    expect(screen.queryByText('Protected content')).toBeNull()
  })
})
