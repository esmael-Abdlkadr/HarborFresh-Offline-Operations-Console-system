// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { LedgerEntryForm } from '../../components/finance/LedgerEntryForm.tsx'
import type { User } from '../../types/index.ts'

const { mockCreateEntry, mockImportOcrText } = vi.hoisted(() => ({
  mockCreateEntry: vi.fn(),
  mockImportOcrText: vi.fn(),
}))

vi.mock('../../services/financeService.ts', () => ({
  financeService: {
    createEntry: mockCreateEntry,
    importOcrText: mockImportOcrText,
  },
  FinanceError: class FinanceError extends Error {
    code: string
    meta?: Record<string, unknown>
    constructor(code: string, message: string, meta?: Record<string, unknown>) {
      super(message)
      this.code = code
      this.meta = meta
    }
  },
}))

const mockActor: User = {
  id: 1,
  username: 'finance',
  role: 'FinanceClerk',
  passwordHash: '',
  salt: '',
  failedAttempts: 0,
}

const mockEncryptionKey = {} as CryptoKey

describe('LedgerEntryForm', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders form fields: type, account code, payee, amount', () => {
    render(<LedgerEntryForm actor={mockActor} encryptionKey={mockEncryptionKey} onCreated={vi.fn()} />)
    expect(screen.getByLabelText(/account code/i)).toBeTruthy()
    expect(screen.getByLabelText(/payee/i)).toBeTruthy()
    expect(screen.getByLabelText(/^amount/i)).toBeTruthy()
    expect(screen.getByRole('combobox')).toBeTruthy()
  })

  it('computes sales tax amount correctly when amount and rate change', () => {
    render(<LedgerEntryForm actor={mockActor} encryptionKey={mockEncryptionKey} onCreated={vi.fn()} />)
    const amountInput = screen.getByLabelText(/^amount/i)
    const taxRateInput = screen.getByLabelText(/sales tax rate/i)

    fireEvent.change(amountInput, { target: { value: '100' } })
    fireEvent.change(taxRateInput, { target: { value: '8.25' } })

    expect(screen.getByText(/sales tax amount preview/i)).toBeTruthy()
    expect(screen.getByText(/\$8\.25/)).toBeTruthy()
  })

  it('shows error on submit failure', async () => {
    const { FinanceError } = await import('../../services/financeService.ts')
    mockCreateEntry.mockRejectedValueOnce(new FinanceError('FINANCE_AMOUNT_INVALID', 'Amount must be positive.'))

    render(<LedgerEntryForm actor={mockActor} encryptionKey={mockEncryptionKey} onCreated={vi.fn()} />)

    const form = screen.getByRole('button', { name: /create entry/i }).closest('form')!
    fireEvent.change(screen.getByLabelText(/account code/i), { target: { value: 'ACC-001' } })
    fireEvent.change(screen.getByLabelText(/payee/i), { target: { value: 'Vendor A' } })
    fireEvent.change(screen.getByLabelText(/^amount/i), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-01-15' } })
    fireEvent.change(screen.getByLabelText(/invoice notes/i), { target: { value: 'Invoice 123' } })
    fireEvent.change(screen.getByLabelText(/account identifier/i), { target: { value: 'ID-1' } })
    fireEvent.submit(form)

    expect(await screen.findByText(/amount must be positive/i)).toBeTruthy()
  })
})
