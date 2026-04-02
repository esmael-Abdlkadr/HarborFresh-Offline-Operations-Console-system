import { useMemo, useState, type FormEvent } from 'react'
import { financeService, FinanceError } from '../../services/financeService.ts'
import type { LedgerEntry, User } from '../../types/index.ts'

interface LedgerEntryFormProps {
  actor: User
  encryptionKey: CryptoKey
  onCreated: (entry: LedgerEntry) => void
}

export function LedgerEntryForm({ actor, encryptionKey, onCreated }: LedgerEntryFormProps) {
  const [form, setForm] = useState({
    type: 'Expense' as LedgerEntry['type'],
    accountCode: '',
    payee: '',
    amount: '',
    salesTaxRate: '0.00',
    date: '',
    memo: '',
    invoiceNotes: '',
    accountIdentifier: '',
    ocrSourceText: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [duplicateInfo, setDuplicateInfo] = useState<number | null>(null)

  const salesTaxAmount = useMemo(() => {
    const amount = Number(form.amount)
    const tax = Number(form.salesTaxRate)
    if (!Number.isFinite(amount) || !Number.isFinite(tax)) return '0.00'
    return ((amount * tax) / 100).toFixed(2)
  }, [form.amount, form.salesTaxRate])

  function toMmDdYyyy(iso: string): string {
    const [year, month, day] = iso.split('-')
    return `${month}/${day}/${year}`
  }

  async function submitData(allowDuplicate = false) {
    setError(null)
    try {
      const entry = await financeService.createEntry(
        {
          type: form.type,
          accountCode: form.accountCode,
          payee: form.payee,
          amount: Number(form.amount),
          salesTaxRate: Number(form.salesTaxRate),
          date: toMmDdYyyy(form.date),
          memo: form.memo,
          invoiceNotes: form.invoiceNotes,
          accountIdentifier: form.accountIdentifier,
          ocrSourceText: form.ocrSourceText || undefined,
        },
        actor,
        encryptionKey,
        { allowDuplicate },
      )

      if (form.ocrSourceText.trim() && entry.id) {
        await financeService.importOcrText(entry.id, form.ocrSourceText, actor)
      }

      onCreated(entry)
      setForm({
        type: 'Expense',
        accountCode: '',
        payee: '',
        amount: '',
        salesTaxRate: '0.00',
        date: '',
        memo: '',
        invoiceNotes: '',
        accountIdentifier: '',
        ocrSourceText: '',
      })
      setDuplicateInfo(null)
    } catch (createError) {
      if (createError instanceof FinanceError && createError.code === 'FINANCE_DUPLICATE_VOUCHER') {
        setDuplicateInfo(Number(createError.meta?.existingId ?? 0))
      } else if (createError instanceof FinanceError) {
        setError(createError.message)
      } else {
        setError(createError instanceof Error ? createError.message : 'Failed to create entry.')
      }
    }
  }

  return (
    <form
      className="form"
      style={{ maxWidth: '100%' }}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        void submitData()
      }}
    >
      <label>
        Type
        <select value={form.type} onChange={(event) => setForm((s) => ({ ...s, type: event.target.value as LedgerEntry['type'] }))}>
          <option value="Income">Income</option>
          <option value="Expense">Expense</option>
          <option value="Transfer">Transfer</option>
        </select>
      </label>
      <label>Account Code<input value={form.accountCode} onChange={(event) => setForm((s) => ({ ...s, accountCode: event.target.value }))} required /></label>
      <label>Payee<input value={form.payee} onChange={(event) => setForm((s) => ({ ...s, payee: event.target.value }))} required /></label>
      <label>Amount<input type="number" step="0.01" value={form.amount} onChange={(event) => setForm((s) => ({ ...s, amount: event.target.value }))} required /></label>
      <label>Sales Tax Rate %<input type="number" step="0.01" min={0} max={12} value={form.salesTaxRate} onChange={(event) => setForm((s) => ({ ...s, salesTaxRate: event.target.value }))} required /></label>
      <div>Sales Tax Amount Preview: ${salesTaxAmount}</div>
      <label>Date<input type="date" value={form.date} onChange={(event) => setForm((s) => ({ ...s, date: event.target.value }))} required /></label>
      <label>Memo<textarea rows={2} value={form.memo} onChange={(event) => setForm((s) => ({ ...s, memo: event.target.value }))} /></label>
      <label>Invoice Notes<textarea rows={2} value={form.invoiceNotes} onChange={(event) => setForm((s) => ({ ...s, invoiceNotes: event.target.value }))} required /></label>
      <label>Account Identifier<input value={form.accountIdentifier} onChange={(event) => setForm((s) => ({ ...s, accountIdentifier: event.target.value }))} required /></label>
      <label>Import OCR Text<textarea rows={4} value={form.ocrSourceText} onChange={(event) => setForm((s) => ({ ...s, ocrSourceText: event.target.value }))} /></label>

      {error && <p className="error">{error}</p>}
      {duplicateInfo !== null && (
        <div className="forbidden">
          A similar entry already exists (ID #{duplicateInfo}). Proceed anyway?
          <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn" type="button" onClick={() => void submitData(true)}>
              Proceed Anyway
            </button>
            <button className="btn secondary" type="button" onClick={() => setDuplicateInfo(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <button className="btn" type="submit">Create Entry</button>
    </form>
  )
}
