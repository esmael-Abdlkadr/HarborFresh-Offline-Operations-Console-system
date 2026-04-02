import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db.ts'

interface StatCardProps {
  label: string
  value: number | undefined
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
        minWidth: 140,
      }}
    >
      <span style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--primary)', lineHeight: 1 }}>
        {value ?? '—'}
      </span>
      <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{label}</span>
    </div>
  )
}

export default function DashboardPage() {
  const openCampaigns = useLiveQuery(() => db.campaigns.where('status').equals('Open').count(), [])
  const confirmedOrders = useLiveQuery(() => db.orders.where('status').equals('Confirmed').count(), [])
  const unassignedTasks = useLiveQuery(() => db.deliveryTasks.where('status').equals('Unassigned').count(), [])
  const pendingNotifications = useLiveQuery(() => db.notifications.where('status').equals('Pending').count(), [])
  const publishedFish = useLiveQuery(() => db.fishEntries.where('status').equals('published').count(), [])
  const openCourses = useLiveQuery(() => db.courses.where('status').equals('Open').count(), [])

  return (
    <main className="page">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Dashboard</h2>
        <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
          HarborFresh Offline Operations Console — live system summary.
        </p>
      </section>

      <section style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <StatCard label="Open Campaigns" value={openCampaigns} />
        <StatCard label="Confirmed Orders" value={confirmedOrders} />
        <StatCard label="Unassigned Tasks" value={unassignedTasks} />
        <StatCard label="Pending Notifications" value={pendingNotifications} />
        <StatCard label="Published Fish" value={publishedFish} />
        <StatCard label="Open Courses" value={openCourses} />
      </section>
    </main>
  )
}
