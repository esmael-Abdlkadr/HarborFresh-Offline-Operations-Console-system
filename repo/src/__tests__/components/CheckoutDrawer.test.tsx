// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckoutDrawer } from '../../components/CheckoutDrawer.tsx'

const { joinCampaignMock } = vi.hoisted(() => ({
  joinCampaignMock: vi.fn(),
}))

vi.mock('../../services/orderService.ts', () => ({
  orderService: {
    joinCampaign: joinCampaignMock,
  },
}))

describe('CheckoutDrawer', () => {
  afterEach(() => {
    cleanup()
    joinCampaignMock.mockReset()
  })

  it('opens and confirm disabled until quantity > 0', () => {
    render(
      <CheckoutDrawer
        open
        campaign={{
          id: 1,
          title: 'c',
          description: '',
          fishEntryId: 1,
          pricePerUnit: 10,
          unit: 'lb',
          minParticipants: 1,
          cutoffAt: Date.now() + 100000,
          status: 'Open',
          createdBy: 1,
          createdAt: Date.now(),
          version: 1,
        }}
        memberId={2}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    )

    expect(screen.getByRole('dialog')).toBeTruthy()
    const confirm = screen.getByRole('button', { name: /confirm join/i })
    expect(confirm.hasAttribute('disabled')).toBe(true)
  })

  it('submits with promised windows from default values', async () => {
    joinCampaignMock.mockResolvedValueOnce({ id: 42 })

    render(
      <CheckoutDrawer
        open
        campaign={{
          id: 1,
          title: 'c',
          description: '',
          fishEntryId: 1,
          pricePerUnit: 10,
          unit: 'lb',
          minParticipants: 1,
          cutoffAt: Date.now() + 100000,
          status: 'Open',
          createdBy: 1,
          createdAt: Date.now(),
          version: 1,
        }}
        memberId={3}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    )

    const qty = screen.getByLabelText(/quantity/i)
    await userEvent.clear(qty)
    await userEvent.type(qty, '1')
    await userEvent.click(screen.getByRole('button', { name: /confirm join/i }))

    await screen.findByText(/join request completed/i)

    expect(joinCampaignMock).toHaveBeenCalledOnce()
    const callArgs = joinCampaignMock.mock.calls[0]
    expect(callArgs[4]).toMatchObject({
      promisedPickupWindow: expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }),
      promisedDeliveryWindow: expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }),
    })
    const opts = callArgs[4] as { promisedPickupWindow: { start: number; end: number }; promisedDeliveryWindow: { start: number; end: number } }
    expect(opts.promisedPickupWindow.end).toBeGreaterThan(opts.promisedPickupWindow.start)
    expect(opts.promisedDeliveryWindow.start).toBeGreaterThan(opts.promisedPickupWindow.end)
  })

  it('shows success state after successful join', async () => {
    joinCampaignMock.mockResolvedValueOnce({ id: 55 })

    render(
      <CheckoutDrawer
        open
        campaign={{
          id: 1,
          title: 'c',
          description: '',
          fishEntryId: 1,
          pricePerUnit: 10,
          unit: 'lb',
          minParticipants: 1,
          cutoffAt: Date.now() + 100000,
          status: 'Open',
          createdBy: 1,
          createdAt: Date.now(),
          version: 1,
        }}
        memberId={2}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    )

    const qty = screen.getByLabelText(/quantity/i)
    await userEvent.clear(qty)
    await userEvent.type(qty, '2')
    await userEvent.click(screen.getByRole('button', { name: /confirm join/i }))

    expect(await screen.findByText(/join request completed/i)).toBeTruthy()
  })
})
