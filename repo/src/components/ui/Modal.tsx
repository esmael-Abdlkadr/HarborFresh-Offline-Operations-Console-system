import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, open, onClose, children }: ModalProps) {
  if (!open) {
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.35)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 40,
      }}
    >
      <div className="card" style={{ maxWidth: 460, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} className="btn secondary">
            Close
          </button>
        </div>
        <div style={{ marginTop: '1rem' }}>{children}</div>
      </div>
    </div>
  )
}
