import type { ReactNode } from 'react'

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.2rem 0.5rem',
        borderRadius: '999px',
        background: 'var(--primary-soft)',
        color: 'var(--primary)',
        fontSize: '0.8rem',
      }}
    >
      {children}
    </span>
  )
}
