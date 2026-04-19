// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BootstrapSetupPage from '../../pages/BootstrapSetupPage.tsx'

const { mockAuthValue } = vi.hoisted(() => ({
  mockAuthValue: {
    currentUser: { id: 1, username: 'admin', role: 'Administrator' as const, passwordHash: '', salt: '', failedAttempts: 0, mustChangePassword: true },
    hasRole: (...roles: string[]) => roles.includes('Administrator'),
    encryptionKey: null,
    login: vi.fn(),
    logout: vi.fn(),
    isReady: true,
  },
}))

vi.mock('../../hooks/useAuth.ts', () => ({ useAuth: () => mockAuthValue }))
vi.mock('../../db/seed.ts', () => ({ getBootstrapPassword: () => null }))
vi.mock('../../services/userService.ts', () => ({
  userService: { resetPassword: vi.fn() },
  UserServiceError: class UserServiceError extends Error {
    constructor(message: string) { super(message) }
  },
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <BootstrapSetupPage />
    </MemoryRouter>,
  )
}

describe('BootstrapSetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    cleanup()
  })

  it('renders Set Your Admin Password heading', () => {
    renderPage()
    expect(screen.getByText('Set Your Admin Password')).toBeTruthy()
  })

  it('shows validation error when passwords do not match', async () => {
    renderPage()
    const newPw = screen.getByLabelText(/new password/i)
    const confirmPw = screen.getByLabelText(/confirm password/i)
    const form = newPw.closest('form')!

    fireEvent.change(newPw, { target: { value: 'password123456' } })
    fireEvent.change(confirmPw, { target: { value: 'differentpassword' } })
    fireEvent.submit(form)

    expect(await screen.findByText(/passwords do not match/i)).toBeTruthy()
  })

  it('shows error when password too short', async () => {
    renderPage()
    const newPw = screen.getByLabelText(/new password/i)
    const confirmPw = screen.getByLabelText(/confirm password/i)
    const form = newPw.closest('form')!

    fireEvent.change(newPw, { target: { value: 'short' } })
    fireEvent.change(confirmPw, { target: { value: 'short' } })
    fireEvent.submit(form)

    expect(await screen.findByText(/at least 12 characters/i)).toBeTruthy()
  })
})
