// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReasonModal } from '../../components/dispatch/ReasonModal.tsx'

describe('ReasonModal', () => {
  afterEach(() => {
    cleanup()
  })

  it('confirm disabled when reason shorter than 10', async () => {
    render(<ReasonModal open title="t" onCancel={() => {}} onConfirm={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/describe the reason/i), 'short')
    expect(screen.getByRole('button', { name: /confirm/i }).hasAttribute('disabled')).toBe(true)
  })

  it('confirm enabled when reason length >= 10', async () => {
    render(<ReasonModal open title="t" onCancel={() => {}} onConfirm={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/describe the reason/i), 'long enough reason')
    expect(screen.getByRole('button', { name: /confirm/i }).hasAttribute('disabled')).toBe(false)
  })
})
