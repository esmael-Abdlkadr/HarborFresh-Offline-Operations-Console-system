import { useParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../hooks/useAuth.ts'
import { CheckoutDrawer } from '../components/CheckoutDrawer.tsx'
import { campaignService } from '../services/campaignService.ts'
import { fishService } from '../services/fishService.ts'
import { orderService } from '../services/orderService.ts'
import { userService } from '../services/userService.ts'
import type { Order } from '../types/index.ts'

function Progress({ current, min }: { current: number; min: number }) {
  const percent = Math.min(100, Math.round((current / min) * 100))
  return (
    <div style={{ width: '100%', background: 'var(--surface-soft)', borderRadius: '999px', overflow: 'hidden' }}>
      <div style={{ width: `${percent}%`, height: 10, background: 'var(--primary)' }} />
    </div>
  )
}

function Countdown({ cutoffAt }: { cutoffAt: number }) {
  const remaining = cutoffAt - new Date().getTime()
  if (remaining <= 0) return <span>Cutoff reached</span>
  const hours = Math.floor(remaining / (60 * 60 * 1000))
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))
  return <span>{hours}h {minutes}m</span>
}

export default function CampaignDetailPage() {
  const { id } = useParams()
  const campaignId = Number(id)
  const { currentUser, hasRole } = useAuth()

  const campaign = useLiveQuery(
    () => (Number.isFinite(campaignId) && currentUser ? campaignService.getCampaign(campaignId, currentUser) : undefined),
    [campaignId, currentUser?.role],
  )
  const fish = useLiveQuery(
    async () => {
      if (!campaign?.fishEntryId || !currentUser) return undefined
      return fishService.getEntry(campaign.fishEntryId, currentUser)
    },
    [campaign?.fishEntryId, currentUser?.role],
  )

  // Scoped query: non-admin members fetch only their own orders
  const ordersRaw = useLiveQuery(
    () => {
      if (!Number.isFinite(campaignId) || !currentUser) return undefined
      return orderService.getCampaignOrders(campaignId, currentUser)
    },
    [campaignId, currentUser?.id, currentUser?.role],
  )
  const orders = useMemo(() => ordersRaw ?? [], [ordersRaw])

  // Admin-only: resolve member usernames for the orders table.
  // Uses targeted ID lookup instead of fetching the entire users table.
  const isAdmin = currentUser?.role === 'Administrator'
  const adminUserMap = useLiveQuery(
    async () => {
      if (!isAdmin || orders.length === 0) return new Map<number, string>()
      const ids = [...new Set(orders.map((o) => o.memberId))]
      return userService.getUsernames(ids)
    },
    [orders, isAdmin],
  )

  const [tab, setTab] = useState<'orders' | 'mine'>('mine')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingOrder, setConfirmingOrder] = useState<Order | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<Order['paymentMethod']>('Cash')

  const myOrder = orders.find((order) => order.memberId === currentUser?.id)
  const participants = orders.filter((order) => order.status !== 'Cancelled').length

  if (campaign === undefined) {
    return (
      <main className="page">
        <section className="card">Loading...</section>
      </main>
    )
  }

  if (campaign === null) {
    return (
      <main className="page">
        <section className="card">Campaign not found.</section>
      </main>
    )
  }

  async function transition(order: Order, nextStatus: Order['status'], paymentMethod?: Order['paymentMethod']) {
    if (!currentUser || !order.id) {
      return
    }
    setError(null)
    try {
      const needsPayment = nextStatus === 'Confirmed'
      await orderService.transitionStatus(order.id, nextStatus, currentUser, {
        expectedVersion: order.version,
        paymentMethod: needsPayment ? paymentMethod : order.paymentMethod,
        paymentNote: needsPayment ? `Offline: ${paymentMethod ?? 'Cash'}` : order.paymentNote,
      })
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : 'Transition failed.')
    } finally {
      setConfirmingOrder(null)
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{campaign.title}</h2>
        <p>{campaign.description}</p>
        <p>Fish: {fish?.commonName ?? 'Unknown fish'}</p>
        <p>
          Price: ${campaign.pricePerUnit.toFixed(2)}/{campaign.unit}
        </p>
        <p>Status: {campaign.status}</p>
        <p>
          Cutoff in: <Countdown cutoffAt={campaign.cutoffAt} />
        </p>
        <p>
          Participant progress: {participants}/{campaign.minParticipants}
        </p>
        <Progress current={participants} min={campaign.minParticipants} />

        {hasRole('Member') && currentUser?.id && campaign.status === 'Open' && !myOrder && (
          <button className="btn" style={{ marginTop: '0.8rem' }} onClick={() => setDrawerOpen(true)}>
            Join Campaign
          </button>
        )}
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {hasRole('Administrator') && (
            <button className={`btn ${tab === 'orders' ? '' : 'secondary'}`} onClick={() => setTab('orders')}>
              Orders
            </button>
          )}
          {hasRole('Member') && (
            <button className={`btn ${tab === 'mine' ? '' : 'secondary'}`} onClick={() => setTab('mine')}>
              My Order
            </button>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        {tab === 'orders' && hasRole('Administrator') && (
          <div style={{ overflowX: 'auto', marginTop: '0.8rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Member</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Qty</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Total</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Payment</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem' }}>{adminUserMap?.get(order.memberId) ?? `User ${order.memberId}`}</td>
                    <td style={{ padding: '0.5rem' }}>{order.quantity}</td>
                    <td style={{ padding: '0.5rem' }}>${order.totalPrice.toFixed(2)}</td>
                    <td style={{ padding: '0.5rem' }}>{order.status}</td>
                    <td style={{ padding: '0.5rem' }}>{order.paymentMethod ?? 'Unpaid'}</td>
                    <td style={{ padding: '0.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {order.status === 'Created' && (
                        <button
                          className="btn secondary"
                          onClick={() => {
                            setConfirmingOrder(order)
                            setSelectedPaymentMethod('Cash')
                          }}
                        >
                          Confirm
                        </button>
                      )}
                      {order.status === 'Created' && (
                        <button className="btn secondary" onClick={() => void transition(order, 'Cancelled')}>
                          Cancel
                        </button>
                      )}
                      {order.status === 'Confirmed' && (
                        <button className="btn secondary" onClick={() => void transition(order, 'Fulfilled')}>
                          Fulfill
                        </button>
                      )}
                      {order.status === 'Confirmed' && (
                        <button className="btn secondary" onClick={() => void transition(order, 'Refunded')}>
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'mine' && hasRole('Member') && (
          <div style={{ marginTop: '0.8rem' }}>
            {!myOrder ? (
              <p>You have not joined this campaign yet.</p>
            ) : (
              <div>
                <p>Order ID: {myOrder.id}</p>
                <p>Quantity: {myOrder.quantity}</p>
                <p>Total: ${myOrder.totalPrice.toFixed(2)}</p>
                <p>Status: {myOrder.status}</p>
                <p>Payment: {myOrder.paymentMethod ?? 'Unpaid'}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {confirmingOrder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm payment"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(8,15,21,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div className="card" style={{ minWidth: 320, maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>Record Payment</h3>
            <p>Order #{confirmingOrder.id} — ${confirmingOrder.totalPrice.toFixed(2)}</p>
            <label style={{ display: 'block', marginBottom: '0.8rem' }}>
              Payment Method
              <select
                value={selectedPaymentMethod}
                onChange={(e) => setSelectedPaymentMethod(e.target.value as Order['paymentMethod'])}
                style={{ display: 'block', width: '100%', marginTop: '0.3rem' }}
              >
                <option value="Cash">Cash</option>
                <option value="CardOnPickup">Card on Pickup</option>
                <option value="ManualMark">Manual Mark</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                className="btn"
                onClick={() => void transition(confirmingOrder, 'Confirmed', selectedPaymentMethod)}
              >
                Confirm Payment
              </button>
              <button className="btn secondary" onClick={() => setConfirmingOrder(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {drawerOpen && currentUser && (
        <CheckoutDrawer
          open={drawerOpen}
          campaign={campaign}
          actor={currentUser}
          onClose={() => setDrawerOpen(false)}
          onSuccess={() => {
            setError(null)
          }}
        />
      )}
    </main>
  )
}
