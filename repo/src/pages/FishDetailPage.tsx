import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../hooks/useAuth.ts'
import { fishService } from '../services/fishService.ts'
import { userService } from '../services/userService.ts'
import { Modal } from '../components/ui/Modal.tsx'
import type { FishRevision, MediaAsset } from '../types/index.ts'

type TabKey = 'info' | 'media' | 'workflow' | 'history'

const EDITORIAL_ROLES = ['ContentEditor', 'ContentReviewer', 'Administrator'] as const

function parseScheduleInput(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})\s(\d{2}):(\d{2})$/)
  if (!match) {
    throw new Error('Schedule must be in MM/DD/YYYY HH:mm format.')
  }

  const [, mm, dd, yyyy, hh, min] = match
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), 0, 0)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid schedule date/time.')
  }

  return date.getTime()
}

function Countdown({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(() => new Date().getTime())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date().getTime()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const diff = Math.max(0, timestamp - now)
  const hours = Math.floor(diff / (60 * 60 * 1000))
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))
  const seconds = Math.floor((diff % (60 * 1000)) / 1000)
  return (
    <span>
      {hours}h {minutes}m {seconds}s
    </span>
  )
}

export default function FishDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fishId = Number(id)
  const { currentUser, hasRole } = useAuth()
  const isEditorial = hasRole(...EDITORIAL_ROLES)
  const entry = useLiveQuery(
    () => (Number.isFinite(fishId) && currentUser ? fishService.getEntry(fishId, currentUser) : undefined),
    [fishId, currentUser?.role],
  )
  const revisionsRaw = useLiveQuery<FishRevision[]>(
    () => (Number.isFinite(fishId) && currentUser ? fishService.getRevisions(fishId, currentUser) : Promise.resolve([])),
    [fishId, currentUser?.role],
  )
  const revisions = useMemo(() => revisionsRaw ?? [], [revisionsRaw])
  // Only editorial users see version history with author names.
  // Fetch targeted usernames (no credential fields) only when needed.
  const authorIds = useMemo(() => {
    if (!isEditorial) return []
    return [...new Set(revisions.map((r) => r.author))]
  }, [isEditorial, revisions])
  const userLookupRaw = useLiveQuery(
    () => (authorIds.length > 0 ? userService.getUsernames(authorIds) : undefined),
    [authorIds],
  )
  const userLookup = userLookupRaw ?? new Map<number, string>()

  const [activeTab, setActiveTab] = useState<TabKey>('info')
  const [workflowComment, setWorkflowComment] = useState('')
  const [scheduleInput, setScheduleInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null)

  const mediaPreviews = useMemo(() => {
    if (!entry) {
      return []
    }
    return entry.mediaAssets.map((asset) => ({
      ...asset,
      url: URL.createObjectURL(asset.blobRef),
    }))
  }, [entry])

  useEffect(() => {
    return () => {
      for (const asset of mediaPreviews) {
        URL.revokeObjectURL(asset.url)
      }
    }
  }, [mediaPreviews])

  async function uploadMedia(files: FileList | null) {
    if (!files || !entry || !entry.id || !currentUser) {
      return
    }

    setError(null)
    try {
      const additions = Array.from(files)
        .map((file): MediaAsset => {
          if (file.size > 50 * 1024 * 1024) {
            throw new Error(`${file.name} exceeds 50MB.`)
          }

          const type: MediaAsset['type'] | null = file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('audio/')
              ? 'audio'
              : file.type.startsWith('video/')
                ? 'video'
                : null

          if (!type) {
            throw new Error(`${file.name} is not image/audio/video.`)
          }

          return {
            assetId: crypto.randomUUID(),
            type,
            filename: file.name,
            size: file.size,
            blobRef: file,
          }
        })

      await fishService.saveRevision(
        entry.id,
        {
          mediaAssets: [...entry.mediaAssets, ...additions],
        },
        currentUser,
      )
    } catch (mediaError) {
      setError(mediaError instanceof Error ? mediaError.message : 'Failed to upload media.')
    }
  }

  async function submitForReview() {
    if (!entry?.id || !currentUser) {
      return
    }
    setError(null)
    try {
      await fishService.submitForReview(entry.id, currentUser)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to submit for review.')
    }
  }

  async function review(decision: 'approve' | 'reject') {
    if (!entry?.id || !currentUser) {
      return
    }

    setError(null)
    try {
      if (decision === 'approve') {
        const scheduleTime = parseScheduleInput(scheduleInput)
        if (scheduleTime) {
          await fishService.saveRevision(entry.id, { scheduledPublishAt: scheduleTime }, currentUser)
        }
      }
      await fishService.reviewEntry(entry.id, decision, workflowComment, currentUser)
      setWorkflowComment('')
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Review action failed.')
    }
  }

  async function confirmRollback() {
    if (!entry?.id || !currentUser || rollbackTarget === null) {
      return
    }

    setError(null)
    try {
      await fishService.rollbackToVersion(entry.id, rollbackTarget, currentUser)
      setRollbackTarget(null)
    } catch (rollbackError) {
      setError(rollbackError instanceof Error ? rollbackError.message : 'Rollback failed.')
    }
  }

  if (entry === undefined) {
    return (
      <main className="page">
        <section className="card">Loading...</section>
      </main>
    )
  }

  if (entry === null) {
    return (
      <main className="page">
        <section className="card">Fish entry not found.</section>
      </main>
    )
  }

  // Non-editorial roles may only view published entries.
  if (!isEditorial && entry.status !== 'published') {
    return (
      <main className="page">
        <section className="card">Fish entry not found.</section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{entry.commonName}</h2>
        <p style={{ color: 'var(--muted)' }}>
          {entry.scientificName} • status: {entry.status}
        </p>

        <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
          <button className={`btn ${activeTab === 'info' ? '' : 'secondary'}`} onClick={() => setActiveTab('info')}>
            Info
          </button>
          <button className={`btn ${activeTab === 'media' ? '' : 'secondary'}`} onClick={() => setActiveTab('media')}>
            Media
          </button>
          {isEditorial && (
            <button className={`btn ${activeTab === 'workflow' ? '' : 'secondary'}`} onClick={() => setActiveTab('workflow')}>
              Workflow
            </button>
          )}
          {isEditorial && (
            <button className={`btn ${activeTab === 'history' ? '' : 'secondary'}`} onClick={() => setActiveTab('history')}>
              Version History
            </button>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        {activeTab === 'info' && (
          <div style={{ marginTop: '0.9rem' }}>
            {hasRole('ContentEditor', 'Administrator') && (
              <button className="btn secondary" onClick={() => navigate(`/fish/new?id=${entry.id}`)}>
                Edit Entry
              </button>
            )}
            <p><strong>Slug:</strong> {entry.slug}</p>
            <p><strong>Morphology Notes:</strong> {entry.morphologyNotes || 'n/a'}</p>
            <p><strong>Habitat:</strong> {entry.habitat || 'n/a'}</p>
            <p><strong>Distribution:</strong> {entry.distribution || 'n/a'}</p>
            <p><strong>Protection Level:</strong> {entry.protectionLevel}</p>
            <p>
              <strong>Taxonomy:</strong> {entry.taxonomy.kingdom} / {entry.taxonomy.phylum} / {entry.taxonomy.class} /{' '}
              {entry.taxonomy.order} / {entry.taxonomy.family} / {entry.taxonomy.genus} / {entry.taxonomy.species}
            </p>
          </div>
        )}

        {activeTab === 'media' && (
          <div style={{ marginTop: '0.9rem' }}>
            {hasRole('ContentEditor', 'Administrator') && (
              <label>
                Upload media
                <input
                  type="file"
                  multiple
                  accept="image/*,audio/*,video/*"
                  onChange={(event) => void uploadMedia(event.target.files)}
                />
              </label>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.6rem', marginTop: '0.8rem' }}>
              {mediaPreviews.map((asset) => (
                <div className="card" key={asset.assetId}>
                  <div><strong>{asset.filename}</strong></div>
                  <div>{Math.round(asset.size / 1024)} KB</div>
                  <div>{asset.type}</div>
                  {asset.type === 'image' && <img src={asset.url} alt={asset.filename} style={{ maxWidth: '100%', marginTop: '0.5rem' }} />}
                  {asset.type === 'audio' && <audio controls src={asset.url} style={{ width: '100%', marginTop: '0.5rem' }} />}
                  {asset.type === 'video' && <video controls src={asset.url} style={{ width: '100%', marginTop: '0.5rem' }} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'workflow' && (
          <div style={{ marginTop: '0.9rem' }}>
            <p>
              <strong>Current Status:</strong> {entry.status}
            </p>

            {(entry.status === 'draft' || entry.status === 'rejected') && hasRole('ContentEditor', 'Administrator') && (
              <button className="btn" onClick={() => void submitForReview()}>
                Submit for Review
              </button>
            )}

            {entry.status === 'in_review' && hasRole('ContentReviewer', 'Administrator') && (
              <div className="form" style={{ maxWidth: 540 }}>
                <label>
                  Reviewer Comment (required)
                  <textarea value={workflowComment} onChange={(event) => setWorkflowComment(event.target.value)} rows={3} />
                </label>

                <label>
                  Schedule Publish At (optional, MM/DD/YYYY HH:mm)
                  <input value={scheduleInput} onChange={(event) => setScheduleInput(event.target.value)} placeholder="MM/DD/YYYY HH:mm" />
                </label>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn" onClick={() => void review('approve')}>
                    Approve
                  </button>
                  <button className="btn secondary" onClick={() => void review('reject')}>
                    Reject
                  </button>
                </div>
              </div>
            )}

            {entry.status === 'approved' && entry.scheduledPublishAt && (
              <p>
                Scheduled for publish at {new Date(entry.scheduledPublishAt).toLocaleString()} (in{' '}
                <Countdown timestamp={entry.scheduledPublishAt} />)
              </p>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div style={{ marginTop: '0.9rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Version</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Author</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Timestamp</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Diff Summary</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {revisions.slice(0, 50).map((revision) => (
                  <tr key={revision.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem' }}>{revision.version}</td>
                    <td style={{ padding: '0.5rem' }}>{userLookup.get(revision.author) ?? `User ${revision.author}`}</td>
                    <td style={{ padding: '0.5rem' }}>{new Date(revision.timestamp).toLocaleString()}</td>
                    <td style={{ padding: '0.5rem' }}>{revision.diffSummary}</td>
                    <td style={{ padding: '0.5rem' }}>
                      {hasRole('ContentEditor', 'Administrator') && (
                        <button className="btn secondary" onClick={() => setRollbackTarget(revision.version)}>
                          Rollback
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        title="Confirm rollback"
        open={rollbackTarget !== null}
        onClose={() => setRollbackTarget(null)}
      >
        <p>Rollback this entry to version {rollbackTarget} and create a new revision?</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
          <button className="btn" onClick={() => void confirmRollback()}>
            Confirm Rollback
          </button>
          <button className="btn secondary" onClick={() => setRollbackTarget(null)}>
            Cancel
          </button>
        </div>
      </Modal>
    </main>
  )
}
