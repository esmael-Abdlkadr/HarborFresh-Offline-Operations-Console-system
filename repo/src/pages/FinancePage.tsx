import { useMemo, useState, type ChangeEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db.ts'
import { useAuth } from '../hooks/useAuth.ts'
import { LedgerEntryForm } from '../components/finance/LedgerEntryForm.tsx'
import { Modal } from '../components/ui/Modal.tsx'
import { financeService, FinanceError } from '../services/financeService.ts'

export default function FinancePage() {
  const { currentUser, encryptionKey, hasRole, logout } = useAuth()
  const entriesRaw = useLiveQuery(() => db.ledgerEntries.orderBy('createdAt').reverse().toArray(), [])
  const entries = entriesRaw ?? []
  const attachmentsRaw = useLiveQuery(() => db.attachments.toArray(), [])

  const [tab, setTab] = useState<'ledger' | 'ocr' | 'export'>('ledger')
  const [error, setError] = useState<string | null>(null)
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [attachTargetId, setAttachTargetId] = useState<number | null>(null)
  const [voidTargetId, setVoidTargetId] = useState<number | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [exportPassword, setExportPassword] = useState('')
  const [importPassword, setImportPassword] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [confirmImport, setConfirmImport] = useState(false)

  const ocrPending = entries.filter(
    (item) => item.status === 'Draft' && item.ocrSourceText && item.ocrReviewedBy === undefined,
  )

  const attachmentMap = useMemo(() => {
    const items = attachmentsRaw ?? []
    const map = new Map<number, number>()
    for (const item of items) {
      map.set(item.ledgerEntryId, (map.get(item.ledgerEntryId) ?? 0) + 1)
    }
    return map
  }, [attachmentsRaw])

  async function post(entryId: number) {
    if (!currentUser) return
    setError(null)
    try {
      await financeService.postEntry(entryId, currentUser)
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : 'Post failed.')
    }
  }

  async function voidEntry() {
    if (!currentUser || !voidTargetId) return
    setError(null)
    try {
      await financeService.voidEntry(voidTargetId, currentUser, voidReason)
      setVoidTargetId(null)
      setVoidReason('')
    } catch (voidError) {
      if (voidError instanceof FinanceError && voidError.code === 'FINANCE_ROLE_FORBIDDEN') {
        setError('403 Forbidden: only administrators can void entries.')
      } else {
        setError(voidError instanceof Error ? voidError.message : 'Void failed.')
      }
    }
  }

  async function onAttachFile(event: ChangeEvent<HTMLInputElement>) {
    if (!currentUser || !attachTargetId) return
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      await financeService.attachFile(attachTargetId, file, currentUser)
      setAttachTargetId(null)
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : 'Attachment failed.')
    }
  }

  async function approveOcr(entryId: number) {
    if (!currentUser) return
    setError(null)
    try {
      await financeService.approveOcr(entryId, currentUser)
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'OCR approval failed.')
    }
  }

  async function runExport() {
    setError(null)
    try {
      await financeService.exportDataset(exportPassword)
      setExportPassword('')
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Export failed.')
    }
  }

  async function runImport(confirmed: boolean) {
    if (!importFile) return
    setError(null)
    try {
      await financeService.importDataset(importFile, importPassword, confirmed)
      setImportPassword('')
      setImportFile(null)
      setConfirmImport(false)
    } catch (importError) {
      if (
        importError instanceof FinanceError &&
        importError.code === 'DATASET_REPLACE_CONFIRM_REQUIRED'
      ) {
        setConfirmImport(true)
      } else {
        setError(importError instanceof Error ? importError.message : 'Import failed.')
      }
    }
  }

  if (!currentUser || !encryptionKey) {
    return (
      <main className="page">
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Finance Locked</h2>
          <p>
            Your session was restored but the encryption key is not available.
            For security, the finance module requires a fresh login to derive the encryption key.
          </p>
          <p>Please log out and log back in to access Finance.</p>
          <button className="btn" onClick={() => {
            logout()
            window.location.href = '/login'
          }}>Log Out and Re-authenticate</button>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Finance Bookkeeping</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`btn ${tab === 'ledger' ? '' : 'secondary'}`} onClick={() => setTab('ledger')}>
            Ledger
          </button>
          <button className={`btn ${tab === 'ocr' ? '' : 'secondary'}`} onClick={() => setTab('ocr')}>
            OCR Review
          </button>
          <button className={`btn ${tab === 'export' ? '' : 'secondary'}`} onClick={() => setTab('export')}>
            Export/Import
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {tab === 'ledger' && (
        <section className="card" style={{ marginTop: '1rem', overflowX: 'auto' }}>
          <button className="btn" onClick={() => setShowNewEntry(true)}>
            New Entry
          </button>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.8rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Date</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Type</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Payee</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Account Code</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Amount</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Tax</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entriesRaw === undefined ? (
                <tr>
                  <td colSpan={8} style={{ padding: '1rem', color: 'var(--muted)', textAlign: 'center' }}>
                    Loading...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '1rem', color: 'var(--muted)', textAlign: 'center' }}>
                    No ledger entries yet.
                  </td>
                </tr>
              ) : null}
              {entries.map((entry) => (
                <tr key={entry.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.5rem' }}>{entry.date}</td>
                  <td style={{ padding: '0.5rem' }}>{entry.type}</td>
                  <td style={{ padding: '0.5rem' }}>{entry.payee}</td>
                  <td style={{ padding: '0.5rem' }}>{entry.accountCode}</td>
                  <td style={{ padding: '0.5rem' }}>${entry.amount.toFixed(2)}</td>
                  <td style={{ padding: '0.5rem' }}>${entry.salesTaxAmount.toFixed(2)}</td>
                  <td style={{ padding: '0.5rem' }}>{entry.status}</td>
                  <td style={{ padding: '0.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {entry.status === 'Draft' && (
                      <button className="btn secondary" onClick={() => void post(entry.id!)}>
                        Post
                      </button>
                    )}
                    <button className="btn secondary" onClick={() => setAttachTargetId(entry.id!)}>
                      Attach File ({attachmentMap.get(entry.id!) ?? 0})
                    </button>
                    {hasRole('Administrator') && (
                      <button className="btn secondary" onClick={() => setVoidTargetId(entry.id!)}>
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'ocr' && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>OCR Pending Review</h3>
          {ocrPending.map((entry) => (
            <div key={entry.id} className="card" style={{ marginTop: '0.5rem' }}>
              <div>
                Entry #{entry.id} - {entry.payee} (${entry.amount.toFixed(2)})
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto' }}>
                {entry.ocrSourceText}
              </pre>
              <button className="btn secondary" onClick={() => void approveOcr(entry.id!)}>
                Approve OCR
              </button>
            </div>
          ))}
        </section>
      )}

      {tab === 'export' && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Export / Import Dataset</h3>
          <div className="form" style={{ maxWidth: 520 }}>
            <label>
              Export Password
              <input
                type="password"
                value={exportPassword}
                onChange={(event) => setExportPassword(event.target.value)}
              />
            </label>
            <button className="btn" onClick={() => void runExport()}>
              Export All Data
            </button>

            <label>
              Import File
              <input
                type="file"
                accept="application/json"
                onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label>
              Import Password
              <input
                type="password"
                value={importPassword}
                onChange={(event) => setImportPassword(event.target.value)}
              />
            </label>
            <button className="btn secondary" onClick={() => void runImport(false)}>
              Import Data
            </button>
          </div>
        </section>
      )}

      <Modal title="New Ledger Entry" open={showNewEntry} onClose={() => setShowNewEntry(false)}>
        <LedgerEntryForm
          actor={currentUser}
          encryptionKey={encryptionKey}
          onCreated={() => {
            setShowNewEntry(false)
          }}
        />
      </Modal>

      <Modal title="Attach File" open={attachTargetId !== null} onClose={() => setAttachTargetId(null)}>
        <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={onAttachFile} />
      </Modal>

      <Modal title="Void Entry" open={voidTargetId !== null} onClose={() => setVoidTargetId(null)}>
        {!hasRole('Administrator') ? (
          <div className="forbidden">403 Forbidden: only Administrator can void ledger entries.</div>
        ) : (
          <div className="form" style={{ maxWidth: '100%' }}>
            <label>
              Reason
              <textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} rows={3} />
            </label>
            <button className="btn" onClick={() => void voidEntry()}>
              Confirm Void
            </button>
          </div>
        )}
      </Modal>

      <Modal title="Confirm Data Import" open={confirmImport} onClose={() => setConfirmImport(false)}>
        <p>This will replace ALL local data. Are you sure?</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" onClick={() => void runImport(true)}>
            Confirm Replace
          </button>
          <button className="btn secondary" onClick={() => setConfirmImport(false)}>
            Cancel
          </button>
        </div>
      </Modal>
    </main>
  )
}
