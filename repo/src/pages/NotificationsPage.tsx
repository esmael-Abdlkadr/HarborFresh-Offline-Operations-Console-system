import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db.ts'
import { useAuth } from '../hooks/useAuth.ts'
import { notificationService } from '../services/notificationService.ts'
import { Table } from '../components/ui/Table.tsx'
import type { Notification } from '../types/index.ts'

export default function NotificationsPage() {
  const { currentUser, hasRole } = useAuth()
  const notificationsRaw = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().toArray(), [])
  const usersRaw = useLiveQuery(() => db.users.toArray(), [])
  const users = usersRaw ?? []
  const [filter, setFilter] = useState<'All' | 'Unread' | 'Read' | 'Archived'>('All')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const notifications = useMemo(() => notificationsRaw ?? [], [notificationsRaw])

  const inbox = useMemo(() => {
    const scoped = hasRole('Administrator')
      ? notifications
      : notifications.filter((item) => item.recipientId === currentUser?.id)
    return scoped.filter((item) => {
      if (filter === 'Unread') return !item.isRead && item.status !== 'Archived'
      if (filter === 'Read') return item.isRead && item.status !== 'Archived'
      if (filter === 'Archived') return item.status === 'Archived'
      return true
    })
  }, [currentUser?.id, filter, hasRole, notifications])

  const selected = inbox.find((item) => item.id === selectedId) ?? null

  async function openNotification(item: Notification) {
    if (!item.id || !currentUser) return
    setSelectedId(item.id)
    await notificationService.markRead(item.id, currentUser)
  }

  async function retryNow(id: number) {
    if (!currentUser) return
    await notificationService.deliver(id, currentUser)
  }

  return (
    <main className="page">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Notification Center</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['All', 'Unread', 'Read', 'Archived'] as const).map((item) => (
            <button key={item} className={`btn ${filter === item ? '' : 'secondary'}`} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="notifications-split" style={{ marginTop: '1rem' }}>
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Subject</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Preview</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Sent At</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Read</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {notificationsRaw === undefined ? (
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem' }} colSpan={6}>Loading...</td>
                </tr>
              ) : inbox.length === 0 ? (
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem' }} colSpan={6}>
                    {notifications.length === 0
                      ? 'No notifications yet.'
                      : 'No notifications match the current filter.'}
                  </td>
                </tr>
              ) : (
                inbox.map((item) => (
                  <tr key={item.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => void openNotification(item)}>
                    <td style={{ padding: '0.5rem' }}>{item.renderedSubject ?? item.templateKey}</td>
                    <td style={{ padding: '0.5rem' }}>{(item.renderedBody ?? '').slice(0, 60)}</td>
                    <td style={{ padding: '0.5rem' }}>{new Date(item.createdAt).toLocaleString()}</td>
                    <td style={{ padding: '0.5rem' }}>{item.status}</td>
                    <td style={{ padding: '0.5rem' }}>{item.isRead ? 'Read' : 'Unread'}</td>
                    <td style={{ padding: '0.5rem' }}>
                      {item.status !== 'Archived' && (
                        <button
                          className="btn secondary"
                          onClick={(event) => {
                            event.stopPropagation()
                            const id = item.id
                            if (id && currentUser) {
                              void notificationService.archive(id, currentUser)
                            }
                          }}
                        >
                          Archive
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <aside className="card">
          <h3 style={{ marginTop: 0 }}>Message</h3>
          {!selected ? (
            <p>Select a notification to read details.</p>
          ) : (
            <div>
              <p><strong>{selected.renderedSubject ?? selected.templateKey}</strong></p>
              <p>{selected.renderedBody ?? 'No body available.'}</p>
            </div>
          )}
        </aside>
      </section>

      {hasRole('Administrator') && (
        <section style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Send Log</h3>
          <Table
            headers={['Recipient', 'Template', 'Status', 'Retries']}
            rows={
              notifications.length === 0
                ? [['No notifications have been delivered yet.', '', '', '']]
                : notifications.map((item) => [
                    users.find((user) => user.id === item.recipientId)?.username ?? item.recipientId,
                    item.templateKey,
                    item.status,
                    item.retries,
                  ])
            }
          />
        </section>
      )}

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Failed Notifications</h3>
        {inbox.filter((item) => item.status === 'Failed').length === 0 ? (
          <p>No failed notifications in this view.</p>
        ) : (
          inbox
            .filter((item) => item.status === 'Failed')
            .map((item) => (
              <div key={`failed-${item.id}`} className="card" style={{ marginTop: '0.4rem' }}>
                <div>
                  {item.renderedSubject ?? item.templateKey} - retries: {item.retries}
                </div>
                {item.id && (
                  <button
                    className="btn secondary"
                    onClick={() => {
                      const id = item.id
                      if (id) {
                        void retryNow(id)
                      }
                    }}
                  >
                    Retry Now
                  </button>
                )}
              </div>
            ))
        )}
      </section>
    </main>
  )
}
