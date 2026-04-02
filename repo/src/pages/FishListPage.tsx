import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db.ts'
import { useAuth } from '../hooks/useAuth.ts'
import type { FishEntry } from '../types/index.ts'

const statusColors: Record<FishEntry['status'], string> = {
  draft: '#6f7f89',
  in_review: '#c47c00',
  approved: '#0a71b8',
  published: '#1f8b45',
  rejected: '#b93934',
}

const protectionLevels: Array<FishEntry['protectionLevel']> = [
  'None',
  'Protected',
  'Endangered',
  'Critically Endangered',
]

// Roles that can access the full editorial workflow (draft/review/history).
// All other roles see only published entries.
const EDITORIAL_ROLES = ['ContentEditor', 'ContentReviewer', 'Administrator'] as const

export default function FishListPage() {
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const isEditorial = hasRole(...EDITORIAL_ROLES)

  const entriesRaw = useLiveQuery(
    () => (isEditorial ? db.fishEntries.toArray() : db.fishEntries.where('status').equals('published').toArray()),
    [isEditorial],
  )
  const entries = useMemo(() => entriesRaw ?? [], [entriesRaw])
  const [statusFilter, setStatusFilter] = useState<'all' | FishEntry['status']>('all')
  const [protectionFilter, setProtectionFilter] = useState<'all' | FishEntry['protectionLevel']>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return entries
      .filter((entry) => (isEditorial && statusFilter !== 'all' ? entry.status === statusFilter : true))
      .filter((entry) => (protectionFilter === 'all' ? true : entry.protectionLevel === protectionFilter))
      .filter((entry) => {
        if (!term) {
          return true
        }
        return (
          entry.commonName.toLowerCase().includes(term) ||
          entry.scientificName.toLowerCase().includes(term)
        )
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [entries, isEditorial, protectionFilter, search, statusFilter])

  return (
    <main className="page">
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Fish Knowledge Base</h2>
            <p style={{ color: 'var(--muted)' }}>Draft, review, publish, and version history.</p>
          </div>
          {hasRole('ContentEditor', 'Administrator') && (
            <button className="btn" onClick={() => navigate('/fish/new')}>
              New Entry
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
          <input
            placeholder="Search common/scientific name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {isEditorial && (
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="in_review">In Review</option>
              <option value="approved">Approved</option>
              <option value="published">Published</option>
              <option value="rejected">Rejected</option>
            </select>
          )}

          <select
            value={protectionFilter}
            onChange={(event) => setProtectionFilter(event.target.value as typeof protectionFilter)}
          >
            <option value="all">All Protection Levels</option>
            {protectionLevels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        <div style={{ overflowX: 'auto', marginTop: '0.9rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Common Name</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Scientific Name</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Protection Level</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem' }} colSpan={5}>
                    {entries.length === 0
                      ? hasRole('ContentEditor', 'Administrator')
                        ? 'No fish entries yet. Create the first entry to start the review workflow.'
                        : 'No fish entries have been published yet.'
                      : 'No fish entries match the current filters.'}
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => navigate(`/fish/${entry.id}`)}
                    style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                  >
                    <td style={{ padding: '0.55rem' }}>{entry.commonName}</td>
                    <td style={{ padding: '0.55rem' }}>{entry.scientificName}</td>
                    <td style={{ padding: '0.55rem' }}>
                      <span
                        style={{
                          background: statusColors[entry.status],
                          color: '#fff',
                          borderRadius: '999px',
                          padding: '0.2rem 0.55rem',
                          fontSize: '0.8rem',
                        }}
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.55rem' }}>{entry.protectionLevel}</td>
                    <td style={{ padding: '0.55rem' }}>{new Date(entry.updatedAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
