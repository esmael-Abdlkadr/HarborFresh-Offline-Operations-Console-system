// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotificationsPage from '../../pages/NotificationsPage.tsx'

const { mockUseLiveQuery, mockAuthValue } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
  mockAuthValue: {
    currentUser: { id: 1, username: 'member', role: 'Member' as const, passwordHash: '', salt: '', failedAttempts: 0 },
    hasRole: (...roles: string[]) => roles.includes('Member'),
    encryptionKey: null,
    login: vi.fn(),
    logout: vi.fn(),
    isReady: true,
  },
}))

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: mockUseLiveQuery }))
vi.mock('../../hooks/useAuth.ts', () => ({ useAuth: () => mockAuthValue }))
vi.mock('../../services/notificationService.ts', () => ({
  notificationService: { markRead: vi.fn(), archive: vi.fn(), deliver: vi.fn(), getInbox: vi.fn() },
}))
vi.mock('../../components/ui/Table.tsx', () => ({ Table: () => null }))

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  )
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders Notification Center heading', () => {
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    expect(screen.getByText('Notification Center')).toBeTruthy()
  })

  it('shows filter tabs All, Unread, Read, Archived', () => {
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Unread' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Read' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Archived' })).toBeTruthy()
  })

  it('shows empty notification list message when no notifications', () => {
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    expect(screen.getByText('No notifications yet.')).toBeTruthy()
  })

  it('shows notification subject when notifications exist', () => {
    mockUseLiveQuery.mockReturnValue([
      {
        id: 1,
        recipientId: 1,
        templateKey: 'ORDER_CONFIRMED',
        templateData: {},
        renderedSubject: 'Your order is confirmed',
        renderedBody: 'Order #1 has been confirmed.',
        status: 'Delivered',
        isRead: false,
        createdAt: Date.now(),
        retries: 0,
      },
    ])
    renderPage()
    expect(screen.getByText('Your order is confirmed')).toBeTruthy()
  })
})
