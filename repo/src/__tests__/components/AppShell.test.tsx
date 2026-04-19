// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from '../../components/Layout/AppShell.tsx'

const { mockLogout, mockAuthValue } = vi.hoisted(() => {
  const mockLogout = vi.fn()
  return {
    mockLogout,
    mockAuthValue: {
      currentUser: { id: 1, username: 'testuser', role: 'Administrator' as const, passwordHash: '', salt: '', failedAttempts: 0 },
      hasRole: (...roles: string[]) => roles.includes('Administrator'),
      encryptionKey: null,
      login: vi.fn(),
      logout: mockLogout,
      isReady: true,
    },
  }
})

vi.mock('../../hooks/useAuth.ts', () => ({ useAuth: () => mockAuthValue }))

function renderAppShell() {
  return render(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>,
  )
}

describe('AppShell', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders username from auth', () => {
    renderAppShell()
    expect(screen.getByText('testuser')).toBeTruthy()
  })

  it('renders role from auth', () => {
    renderAppShell()
    expect(screen.getByText('Administrator')).toBeTruthy()
  })

  it('renders Logout button', () => {
    renderAppShell()
    expect(screen.getByRole('button', { name: /logout/i })).toBeTruthy()
  })

  it('Logout button calls logout when clicked', async () => {
    renderAppShell()
    const logoutButton = screen.getByRole('button', { name: /logout/i })
    await userEvent.click(logoutButton)
    expect(mockLogout).toHaveBeenCalledOnce()
  })
})
