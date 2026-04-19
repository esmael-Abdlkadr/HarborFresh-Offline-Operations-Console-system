// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ForbiddenInline } from '../../components/ForbiddenInline.tsx'

describe('ForbiddenInline', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders 403 Forbidden heading', () => {
    render(<ForbiddenInline />)
    expect(screen.getByText('403 Forbidden')).toBeTruthy()
  })

  it('renders description text about role access', () => {
    render(<ForbiddenInline />)
    expect(screen.getByText(/your role does not have access to this module/i)).toBeTruthy()
  })
})
