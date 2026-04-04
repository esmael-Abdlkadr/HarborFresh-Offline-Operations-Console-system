import { useEffect, useMemo, useRef, useState } from 'react'
import { orderService } from '../services/orderService.ts'
import type { Campaign, Order, User } from '../types/index.ts'

interface CheckoutDrawerProps {
  open: boolean
  campaign: Campaign
  actor: User
  onClose: () => void
  onSuccess: (order: Order) => void
}

function toDateTimeLocalValue(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDateTimeLocal(val: string): number | null {
  if (!val) return null
  const ms = new Date(val).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function CheckoutDrawer({ open, campaign, actor, onClose, onSuccess }: CheckoutDrawerProps) {
  const [quantity, setQuantity] = useState(0)
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successOrder, setSuccessOrder] = useState<Order | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const now = Date.now()
  const [pickupStart, setPickupStart] = useState(toDateTimeLocalValue(now + 30 * 60 * 1000))
  const [pickupEnd, setPickupEnd] = useState(toDateTimeLocalValue(now + 90 * 60 * 1000))
  const [deliveryStart, setDeliveryStart] = useState(toDateTimeLocalValue(now + 120 * 60 * 1000))
  const [deliveryEnd, setDeliveryEnd] = useState(toDateTimeLocalValue(now + 240 * 60 * 1000))

  const totalPrice = useMemo(() => Number((campaign.pricePerUnit * quantity).toFixed(2)), [campaign.pricePerUnit, quantity])

  // Reset window defaults when drawer reopens
  useEffect(() => {
    if (open) {
      const base = Date.now()
      setPickupStart(toDateTimeLocalValue(base + 30 * 60 * 1000))
      setPickupEnd(toDateTimeLocalValue(base + 90 * 60 * 1000))
      setDeliveryStart(toDateTimeLocalValue(base + 120 * 60 * 1000))
      setDeliveryEnd(toDateTimeLocalValue(base + 240 * 60 * 1000))
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const prevFocus = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }

      if (event.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) {
          return
        }
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement

        if (event.shiftKey && active === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      prevFocus?.focus()
    }
  }, [onClose, open])

  async function confirmJoin() {
    setLoading(true)
    setError(null)
    try {
      const operationId = crypto.randomUUID()
      if (quantity <= 0) {
        setError('Quantity must be greater than 0.')
        return
      }

      const psMs = fromDateTimeLocal(pickupStart)
      const peMs = fromDateTimeLocal(pickupEnd)
      const dsMs = fromDateTimeLocal(deliveryStart)
      const deMs = fromDateTimeLocal(deliveryEnd)

      if (!psMs || !peMs || !dsMs || !deMs) {
        setError('Please fill in all pickup and delivery window fields.')
        return
      }

      const nowMs = Date.now()
      if (psMs <= nowMs) {
        setError('Pickup start must be in the future.')
        return
      }
      if (peMs <= psMs) {
        setError('Pickup end must be after pickup start.')
        return
      }
      if (dsMs <= peMs) {
        setError('Delivery start must be after pickup end.')
        return
      }
      if (deMs <= dsMs) {
        setError('Delivery end must be after delivery start.')
        return
      }

      const order = await orderService.joinCampaign(campaign.id!, actor.id!, actor, quantity, operationId, campaign.version, {
        fulfillmentAddress: address.trim() || undefined,
        promisedPickupWindow: { start: psMs, end: peMs },
        promisedDeliveryWindow: { start: dsMs, end: deMs },
      })
      setSuccessOrder(order)
      onSuccess(order)
      window.setTimeout(() => {
        onClose()
        setSuccessOrder(null)
      }, 2000)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Join failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(8, 15, 21, 0.45)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
          zIndex: 35,
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Checkout drawer"
        ref={panelRef}
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(420px, 100vw)',
          height: '100vh',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s ease',
          zIndex: 40,
          padding: '1rem',
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
          gap: '1rem',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Join Campaign</h3>
          <button className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {successOrder ? (
          <div className="card" style={{ background: 'var(--surface-soft)' }}>
            <p>Join request completed.</p>
            <p>
              Order ID: <strong>{successOrder.id}</strong>
            </p>
          </div>
        ) : (
          <div className="form" style={{ maxWidth: '100%' }}>
            <label>
              Quantity
              <input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(0, Number(event.target.value) || 0))}
              />
            </label>
            <label>
              Delivery Address (optional)
              <input
                type="text"
                placeholder="e.g. 123 Harbor Way, Dock B"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </label>

            <fieldset style={{ border: '1px solid var(--border)', borderRadius: '0.4rem', padding: '0.75rem' }}>
              <legend style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 0.25rem' }}>Pickup Window</legend>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                Start
                <input
                  type="datetime-local"
                  value={pickupStart}
                  onChange={(e) => setPickupStart(e.target.value)}
                />
              </label>
              <label style={{ display: 'block' }}>
                End
                <input
                  type="datetime-local"
                  value={pickupEnd}
                  onChange={(e) => setPickupEnd(e.target.value)}
                />
              </label>
            </fieldset>

            <fieldset style={{ border: '1px solid var(--border)', borderRadius: '0.4rem', padding: '0.75rem' }}>
              <legend style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 0.25rem' }}>Delivery Window</legend>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                Start
                <input
                  type="datetime-local"
                  value={deliveryStart}
                  onChange={(e) => setDeliveryStart(e.target.value)}
                />
              </label>
              <label style={{ display: 'block' }}>
                End
                <input
                  type="datetime-local"
                  value={deliveryEnd}
                  onChange={(e) => setDeliveryEnd(e.target.value)}
                />
              </label>
            </fieldset>

            <div className="card" style={{ background: 'var(--surface-soft)' }}>
              <div>Price per unit: ${campaign.pricePerUnit.toFixed(2)}</div>
              <div>Total: ${totalPrice.toFixed(2)}</div>
            </div>

            {error && <p className="error">{error}</p>}
          </div>
        )}

        <button
          className="btn"
          onClick={() => void confirmJoin()}
          disabled={loading || Boolean(successOrder) || quantity <= 0}
        >
          {loading ? 'Submitting...' : 'Confirm Join'}
        </button>
      </aside>
    </>
  )
}
