// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '../../pages/LoginPage.tsx'
import { AuthError } from '../../services/authService.ts'

const loginMock = vi.fn()

vi.mock('../../hooks/useAuth.ts', () => ({
  useAuth: () => ({
    login: loginMock,
  }),
}))

describe('LoginPage', () => {
  afterEach(() => {
    cleanup()
    loginMock.mockReset()
  })

  it('renders username and password inputs', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText(/username/i)).toBeTruthy()
    expect(screen.getByLabelText(/password/i)).toBeTruthy()
  })

  it('shows account locked message on AUTH_LOCKED', async () => {
    loginMock.mockRejectedValueOnce(new AuthError('AUTH_LOCKED', 'Account is locked.', 60_000))

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await userEvent.type(screen.getByLabelText(/username/i), 'admin')
    await userEvent.type(screen.getByLabelText(/password/i), 'bad')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/account locked/i)).toBeTruthy()
  })

  it('disables submit button while submitting', async () => {
    let resolver: (() => void) | undefined
    loginMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolver = resolve
        }),
    )

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await userEvent.type(screen.getByLabelText(/username/i), 'admin')
    await userEvent.type(screen.getByLabelText(/password/i), 'HarborAdmin#1!')
    const button = screen.getByRole('button', { name: /sign in/i })
    await userEvent.click(button)
    expect(screen.getByRole('button', { name: /signing in/i }).hasAttribute('disabled')).toBe(true)
    resolver?.()
  })
})
