// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import FishEditPage from '../../pages/FishEditPage.tsx'

const { mockAuthValue } = vi.hoisted(() => ({
  mockAuthValue: {
    currentUser: { id: 1, username: 'editor', role: 'ContentEditor' as const, passwordHash: '', salt: '', failedAttempts: 0 },
    hasRole: (...roles: string[]) => roles.includes('ContentEditor'),
    encryptionKey: null,
    login: vi.fn(),
    logout: vi.fn(),
    isReady: true,
  },
}))

vi.mock('../../hooks/useAuth.ts', () => ({ useAuth: () => mockAuthValue }))
vi.mock('../../services/fishService.ts', () => ({
  fishService: {
    getEntryForEdit: vi.fn().mockResolvedValue(null),
    createEntry: vi.fn(),
    saveRevision: vi.fn(),
    submitForReview: vi.fn(),
  },
}))

function renderNewEntry() {
  return render(
    <MemoryRouter initialEntries={['/fish/new']}>
      <Routes>
        <Route path="/fish/new" element={<FishEditPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('FishEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    cleanup()
  })

  it('renders form fields for new entry', () => {
    renderNewEntry()
    expect(screen.getByLabelText(/Common Name/i)).toBeTruthy()
    expect(screen.getByLabelText(/Scientific Name/i)).toBeTruthy()
  })

  it('new entry mode shows Create Fish Entry heading', () => {
    renderNewEntry()
    expect(screen.getByText('Create Fish Entry')).toBeTruthy()
  })

  it('shows Save Draft button', () => {
    renderNewEntry()
    expect(screen.getByRole('button', { name: /save draft/i })).toBeTruthy()
  })

  it('shows Save & Submit for Review button', () => {
    renderNewEntry()
    expect(screen.getByRole('button', { name: /save & submit for review/i })).toBeTruthy()
  })
})
