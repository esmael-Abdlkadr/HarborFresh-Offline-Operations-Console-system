import { useLiveQuery } from 'dexie-react-hooks'
import { dashboardService } from '../services/dashboardService.ts'

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
  const counts = useLiveQuery(() => dashboardService.getCounts(), [])

  return (
    <main className="page">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Dashboard</h2>
        <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
          HarborFresh Offline Operations Console — live system summary.
        </p>
      </section>

      <section style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <StatCard label="Open Campaigns" value={counts?.openCampaigns} />
        <StatCard label="Confirmed Orders" value={counts?.confirmedOrders} />
        <StatCard label="Unassigned Tasks" value={counts?.unassignedTasks} />
        <StatCard label="Pending Notifications" value={counts?.pendingNotifications} />
        <StatCard label="Published Fish" value={counts?.publishedFish} />
        <StatCard label="Open Courses" value={counts?.openCourses} />
      </section>
    </main>
  )
}
