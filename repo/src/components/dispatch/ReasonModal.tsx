import { useMemo, useState } from 'react'
import { Modal } from '../ui/Modal.tsx'

interface ReasonModalProps {
  open: boolean
  title: string
  onCancel: () => void
  onConfirm: (reason: string) => void
}

export function ReasonModal({ open, title, onCancel, onConfirm }: ReasonModalProps) {
  const [reason, setReason] = useState('')
  const length = reason.trim().length
  const canConfirm = useMemo(() => length >= 10, [length])

  return (
    <Modal title={title} open={open} onClose={onCancel}>
      <label>
        <textarea
          rows={4}
          placeholder="Describe the reason for this change (min 10 characters)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          style={{ width: '100%' }}
        />
      </label>
      <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{length} / 10</div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
        <button className="btn" disabled={!canConfirm} onClick={() => {
          onConfirm(reason.trim())
          setReason('')
        }}>
          Confirm
        </button>
        <button className="btn secondary" onClick={() => {
          setReason('')
          onCancel()
        }}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
