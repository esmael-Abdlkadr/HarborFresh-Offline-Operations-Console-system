// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TaskCard } from '../../components/dispatch/TaskCard.tsx'
import type { DeliveryTask } from '../../types/index.ts'

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

const now = Date.now()
const sampleTask: DeliveryTask = {
  id: 42,
  orderId: 101,
  batchId: undefined,
  status: 'Unassigned',
  priority: 1,
  weightLbs: 25,
  promisedPickupWindow: { start: now + 3600000, end: now + 7200000 },
  promisedDeliveryWindow: { start: now + 7200000, end: now + 10800000 },
  address: '123 Harbor Street, Fishtown, CA 90210',
  version: 1,
}

describe('TaskCard', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders order ID', () => {
    render(<TaskCard task={sampleTask} conflict={false} />)
    expect(screen.getByText('Order #101')).toBeTruthy()
  })

  it('shows address (truncated to 40 chars)', () => {
    render(<TaskCard task={sampleTask} conflict={false} />)
    // The component renders address.slice(0,40)
    const truncated = '123 Harbor Street, Fishtown, CA 90210'.slice(0, 40)
    expect(screen.getByText(truncated)).toBeTruthy()
  })

  it('shows weight, priority, and status', () => {
    render(<TaskCard task={sampleTask} conflict={false} />)
    expect(screen.getByText(/25 lbs/)).toBeTruthy()
    expect(screen.getByText(/Priority 1/)).toBeTruthy()
    expect(screen.getByText(/Unassigned/)).toBeTruthy()
  })

  it('shows conflict warning when conflict=true', () => {
    render(<TaskCard task={sampleTask} conflict={true} />)
    expect(screen.getByTitle('Conflict')).toBeTruthy()
    expect(screen.getByText('⚠')).toBeTruthy()
  })

  it('does not show conflict warning when conflict=false', () => {
    render(<TaskCard task={sampleTask} conflict={false} />)
    expect(screen.queryByTitle('Conflict')).toBeNull()
  })
})
