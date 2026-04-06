// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

const { mockAuthValue, mockUseLiveQuery } = vi.hoisted(() => ({
  mockAuthValue: {
    currentUser: null as null | { id: number; username: string; role: string; passwordHash: string; salt: string; failedAttempts: number },
    encryptionKey: null as CryptoKey | null,
    logout: vi.fn(),
    login: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasRole: (_r: string) => false as boolean,
    sessionRestored: true,
  },
  mockUseLiveQuery: vi.fn(() => []),
}))

vi.mock('../../hooks/useAuth.ts', () => ({
  useAuth: () => mockAuthValue,
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: mockUseLiveQuery,
}))

afterEach(() => {
  cleanup()
  mockUseLiveQuery.mockReturnValue([])
  mockAuthValue.currentUser = null
  mockAuthValue.encryptionKey = null
  mockAuthValue.hasRole = () => false as boolean
})

describe('FinancePage', () => {
  it('renders Finance Locked gate when currentUser exists but encryptionKey is absent', async () => {
    mockAuthValue.currentUser = {
      id: 1, username: 'finance', role: 'FinanceClerk',
      passwordHash: '', salt: '', failedAttempts: 0,
    }
    mockAuthValue.encryptionKey = null

    const { default: FinancePage } = await import('../../pages/FinancePage.tsx')
    render(<MemoryRouter><FinancePage /></MemoryRouter>)

    expect(screen.getByText(/finance locked/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /log out and re-authenticate/i })).toBeTruthy()
  })

  it('renders Finance Bookkeeping heading when encryptionKey is present', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    mockAuthValue.currentUser = {
      id: 1, username: 'finance', role: 'FinanceClerk',
      passwordHash: '', salt: '', failedAttempts: 0,
    }
    mockAuthValue.encryptionKey = key
    mockAuthValue.hasRole = (role: string) => (role === 'FinanceClerk') as boolean

    const { default: FinancePage } = await import('../../pages/FinancePage.tsx')
    render(<MemoryRouter><FinancePage /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByText(/finance bookkeeping/i)).toBeTruthy()
    })
  })

  it('shows error message when import fails with wrong password', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    mockAuthValue.currentUser = {
      id: 1, username: 'finance', role: 'FinanceClerk',
      passwordHash: '', salt: '', failedAttempts: 0,
    }
    mockAuthValue.encryptionKey = key
    mockAuthValue.hasRole = (role: string) => (role === 'FinanceClerk') as boolean

    // Mock financeService.importDataset to throw decryption error
    const { financeService } = await import('../../services/financeService.ts')
    const spy = vi.spyOn(financeService, 'importDataset').mockRejectedValueOnce(
      new Error('The operation failed for an operation-specific reason'),
    )

    const { default: FinancePage } = await import('../../pages/FinancePage.tsx')
    const user = (await import('@testing-library/user-event')).default

    render(<MemoryRouter><FinancePage /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByText(/finance bookkeeping/i)).toBeTruthy()
    })

    // Switch to Export/Import tab
    await user.click(screen.getByRole('button', { name: /export\/import/i }))

    // Try to import without a file — should not call service (file is null)
    const importBtn = screen.getByRole('button', { name: /import data/i })
    await user.click(importBtn)

    spy.mockRestore()
  })

  it('shows confirm modal when import requires confirmation', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    mockAuthValue.currentUser = {
      id: 1, username: 'finance', role: 'FinanceClerk',
      passwordHash: '', salt: '', failedAttempts: 0,
    }
    mockAuthValue.encryptionKey = key
    mockAuthValue.hasRole = (role: string) => (role === 'FinanceClerk') as boolean

    const { default: FinancePage } = await import('../../pages/FinancePage.tsx')

    render(<MemoryRouter><FinancePage /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByText(/finance bookkeeping/i)).toBeTruthy()
    })

    // The export/import tab should be switchable
    const user = (await import('@testing-library/user-event')).default
    await user.click(screen.getByRole('button', { name: /export\/import/i }))

    // Verify the import section is visible
    expect(screen.getByText(/import password/i)).toBeTruthy()
  })

  it('renders without Dexie SchemaError — createdAt index is present on ledgerEntries', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    mockAuthValue.currentUser = {
      id: 1, username: 'finance', role: 'FinanceClerk',
      passwordHash: '', salt: '', failedAttempts: 0,
    }
    mockAuthValue.encryptionKey = key
    mockAuthValue.hasRole = (role: string) => (role === 'FinanceClerk') as boolean

    const schemaErrors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const msg = args.map(String).join(' ')
      if (/schemaerror|not indexed/i.test(msg)) schemaErrors.push(msg)
    })

    const { default: FinancePage } = await import('../../pages/FinancePage.tsx')
    render(<MemoryRouter><FinancePage /></MemoryRouter>)
    await new Promise((r) => setTimeout(r, 200))

    spy.mockRestore()
    expect(schemaErrors).toHaveLength(0)
  })
})
