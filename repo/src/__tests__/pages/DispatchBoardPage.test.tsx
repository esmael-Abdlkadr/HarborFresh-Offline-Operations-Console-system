// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DispatchBoardPage from '../../pages/DispatchBoardPage.tsx'

const { mockUseLiveQuery, mockAuthDispatcher } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
  mockAuthDispatcher: {
    currentUser: { id: 1, username: 'dispatcher', role: 'Dispatcher' as const, passwordHash: '', salt: '', failedAttempts: 0 },
    hasRole: (...roles: string[]) => roles.includes('Dispatcher'),
    encryptionKey: null,
    login: vi.fn(),
    logout: vi.fn(),
    isReady: true,
  },
}))

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: mockUseLiveQuery }))
vi.mock('../../hooks/useAuth.ts', () => ({ useAuth: () => mockAuthDispatcher }))

// Mock DnD kit
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: unknown }) => children,
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  closestCenter: vi.fn(),
}))
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: unknown }) => children,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <DispatchBoardPage />
    </MemoryRouter>,
  )
}

describe('DispatchBoardPage', () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset()
    mockUseLiveQuery.mockReturnValue([])
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders Delivery Dispatch Board heading', () => {
    renderPage()
    expect(screen.getByText('Delivery Dispatch Board')).toBeTruthy()
  })

  it('shows date selector', () => {
    renderPage()
    expect(screen.getByLabelText(/date/i)).toBeTruthy()
  })

  it('shows Auto Plan button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /auto plan/i })).toBeTruthy()
  })

  it('shows Add Batch button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /add batch/i })).toBeTruthy()
  })
})
