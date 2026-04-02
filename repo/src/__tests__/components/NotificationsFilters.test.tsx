// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockNotifications = [
  {
    id: 1,
    recipientId: 10,
    templateKey: 'COURSE_ENROLLED',
    status: 'Delivered',
    isRead: true,
    renderedSubject: 'You are enrolled',
    renderedBody: 'You have been enrolled in the course.',
    createdAt: Date.now() - 60000,
    retries: 0,
  },
  {
    id: 2,
    recipientId: 10,
    templateKey: 'COURSE_WAITLISTED',
    status: 'Delivered',
    isRead: false,
    renderedSubject: 'You are waitlisted',
    renderedBody: 'You are on the waitlist.',
    createdAt: Date.now() - 30000,
    retries: 0,
  },
  {
    id: 3,
    recipientId: 10,
    templateKey: 'COURSE_FEE_CHANGED',
    status: 'Archived',
    isRead: true,
    renderedSubject: 'Fee changed',
    renderedBody: 'Course fee updated.',
    createdAt: Date.now() - 10000,
    retries: 0,
  },
]

const { mockAuthValue, mockUseLiveQuery } = vi.hoisted(() => ({
  mockAuthValue: {
    currentUser: { id: 10, username: 'member', role: 'Member' as const },
    hasRole: () => false as boolean,
    encryptionKey: null,
    login: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
  },
  mockUseLiveQuery: vi.fn(),
}))

vi.mock('../../hooks/useAuth.ts', () => ({ useAuth: () => mockAuthValue }))
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: mockUseLiveQuery }))
vi.mock('../../services/notificationService.ts', () => ({
  notificationService: { markRead: vi.fn(), archive: vi.fn(), deliver: vi.fn() },
}))
vi.mock('../../components/ui/Table.tsx', () => ({ Table: () => null }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function renderPage() {
  mockUseLiveQuery.mockReturnValue(mockNotifications)
  const { default: NotificationsPage } = await import('../../pages/NotificationsPage.tsx')
  render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  )
}

describe('NotificationsPage filters', () => {
  it('shows All notifications by default', async () => {
    await renderPage()
    expect(screen.queryByText('You are enrolled')).toBeTruthy()
    expect(screen.queryByText('You are waitlisted')).toBeTruthy()
  })

  it('Unread filter shows only unread non-archived items', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }))
    await waitFor(() => {
      expect(screen.queryByText('You are enrolled')).toBeNull()
      expect(screen.queryByText('You are waitlisted')).toBeTruthy()
      expect(screen.queryByText('Fee changed')).toBeNull()
    })
  })

  it('Read filter shows only read non-archived items', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    await waitFor(() => {
      expect(screen.queryByText('You are enrolled')).toBeTruthy()
      expect(screen.queryByText('You are waitlisted')).toBeNull()
      expect(screen.queryByText('Fee changed')).toBeNull()
    })
  })

  it('Archived filter shows only archived items', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }))
    await waitFor(() => {
      expect(screen.queryByText('You are enrolled')).toBeNull()
      expect(screen.queryByText('You are waitlisted')).toBeNull()
      expect(screen.queryByText('Fee changed')).toBeTruthy()
    })
  })

  it('All filter shows all notifications', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }))
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => {
      expect(screen.queryByText('You are enrolled')).toBeTruthy()
      expect(screen.queryByText('You are waitlisted')).toBeTruthy()
      expect(screen.queryByText('Fee changed')).toBeTruthy()
    })
  })
})
