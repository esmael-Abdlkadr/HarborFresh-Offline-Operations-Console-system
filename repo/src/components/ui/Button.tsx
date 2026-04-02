import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: ButtonVariant
}

export function Button({ children, variant = 'primary', className, ...props }: ButtonProps) {
  const classes = ['btn', variant === 'secondary' ? 'secondary' : '', className ?? '']
    .join(' ')
    .trim()

  return (
    <button {...props} className={classes}>
      {children}
    </button>
  )
}
