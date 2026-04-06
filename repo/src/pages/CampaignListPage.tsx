import { useMemo, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { campaignService } from '../services/campaignService.ts'
import { orderService } from '../services/orderService.ts'
import { useAuth } from '../hooks/useAuth.ts'

type FilterTab = 'All' | 'Open' | 'Confirmed' | 'Closed'

function Countdown({ cutoffAt }: { cutoffAt: number }) {
  const delta = cutoffAt - new Date().getTime()
  if (delta <= 0) {
    return <span>Cutoff reached</span>
  }

  const hours = Math.floor(delta / (1000 * 60 * 60))
  const minutes = Math.floor((delta % (1000 * 60 * 60)) / (1000 * 60))
  return (
    <span>
      {hours}h {minutes}m
    </span>
  )
}

export default function CampaignListPage() {
  const { currentUser, hasRole } = useAuth()
  const campaignsRaw = useLiveQuery(
    () => (currentUser ? campaignService.listCampaigns(currentUser) : undefined),
    [currentUser?.role],
  )
  const participantCountsRaw = useLiveQuery(() => orderService.getParticipantCounts(), [])
  const campaigns = campaignsRaw ?? []
  const participantCounts = participantCountsRaw ?? new Map<number, number>()
  const fishEntriesRaw = useLiveQuery(
    () => (currentUser ? campaignService.getPublishedFishEntries(currentUser) : undefined),
    [currentUser?.role],
  )

  const [tab, setTab] = useState<FilterTab>('All')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    fishEntryId: 0,
    pricePerUnit: 0,
    unit: 'lb',
    minParticipants: 1,
    cutoffAt: '',
  })

  const fishEntries = useMemo(() => fishEntriesRaw ?? [], [fishEntriesRaw])

  const fishMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const fish of fishEntries) {
      if (fish.id) {
        map.set(fish.id, fish.commonName)
      }
    }
    return map
  }, [fishEntries])

  const filtered = campaigns
    .filter((campaign) => {
      if (tab === 'All') return true
      if (tab === 'Closed') return campaign.status === 'Closed' || campaign.status === 'Cancelled'
      return campaign.status === tab
    })
    .sort((a, b) => b.createdAt - a.createdAt)

  async function onCreateCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!currentUser) {
      setError('Must be logged in.')
      return
    }

    setCreating(true)
    setError(null)
    try {
      const cutoff = new Date(form.cutoffAt).getTime()
      await campaignService.createCampaign(
        {
          title: form.title,
          description: form.description,
          fishEntryId: Number(form.fishEntryId),
          pricePerUnit: Number(form.pricePerUnit),
          unit: form.unit,
          minParticipants: Number(form.minParticipants),
          cutoffAt: cutoff,
        },
        currentUser,
      )
      setForm({
        title: '',
        description: '',
        fishEntryId: 0,
        pricePerUnit: 0,
        unit: 'lb',
        minParticipants: 1,
        cutoffAt: '',
      })
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Campaign creation failed.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Group-Buy Campaigns</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(['All', 'Open', 'Confirmed', 'Closed'] as FilterTab[]).map((item) => (
            <button
              key={item}
              className={`btn ${tab === item ? '' : 'secondary'}`}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {hasRole('Administrator', 'Member') && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>New Campaign</h3>
          <form className="form" style={{ maxWidth: '100%' }} onSubmit={onCreateCampaign}>
            <label>
              Title
              <input value={form.title} onChange={(event) => setForm((s) => ({ ...s, title: event.target.value }))} required />
            </label>
            <label>
              Description
              <textarea value={form.description} onChange={(event) => setForm((s) => ({ ...s, description: event.target.value }))} rows={3} />
            </label>
            <label>
              Fish Entry
              <select value={form.fishEntryId} onChange={(event) => setForm((s) => ({ ...s, fishEntryId: Number(event.target.value) }))} required>
                <option value={0}>Select published fish</option>
                {fishEntries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.commonName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Price Per Unit
              <input type="number" step="0.01" min={0.01} value={form.pricePerUnit} onChange={(event) => setForm((s) => ({ ...s, pricePerUnit: Number(event.target.value) }))} required />
            </label>
            <label>
              Unit
              <input value={form.unit} onChange={(event) => setForm((s) => ({ ...s, unit: event.target.value }))} required />
            </label>
            <label>
              Min Participants
              <input type="number" min={1} step={1} value={form.minParticipants} onChange={(event) => setForm((s) => ({ ...s, minParticipants: Number(event.target.value) }))} required />
            </label>
            <label>
              Cutoff
              <input type="datetime-local" value={form.cutoffAt} onChange={(event) => setForm((s) => ({ ...s, cutoffAt: event.target.value }))} required />
            </label>

            {error && <p className="error">{error}</p>}
            <button className="btn" disabled={creating} type="submit">
              {creating ? 'Creating...' : 'Create Campaign'}
            </button>
          </form>
        </section>
      )}

      <section style={{ marginTop: '1rem', display: 'grid', gap: '0.8rem' }}>
        {campaignsRaw === undefined ? (
          <article className="card">
            <p style={{ color: 'var(--muted)' }}>Loading...</p>
          </article>
        ) : filtered.length === 0 ? (
          <article className="card">
            <h3 style={{ marginTop: 0 }}>No campaigns to show</h3>
            <p>
              {campaigns.length === 0
                ? hasRole('Administrator', 'Member')
                  ? 'Create a campaign to start a new group-buy round.'
                  : 'Campaigns will appear here once one is created.'
                : 'No campaigns match the current status filter.'}
            </p>
          </article>
        ) : (
          filtered.map((campaign) => {
            const participantCount = campaign.id ? (participantCounts.get(campaign.id) ?? 0) : 0
            return (
              <article className="card" key={campaign.id}>
                <h3 style={{ marginTop: 0 }}>{campaign.title}</h3>
                <p>{campaign.description}</p>
                <p>Fish: {fishMap.get(campaign.fishEntryId) ?? 'Unknown fish'}</p>
                <p>
                  Price: ${campaign.pricePerUnit.toFixed(2)}/{campaign.unit}
                </p>
                <p>
                  Participants: {participantCount}/{campaign.minParticipants}
                </p>
                <p>Status: {campaign.status}</p>
                <p>
                  Cutoff in: <Countdown cutoffAt={campaign.cutoffAt} />
                </p>
                <Link to={`/campaigns/${campaign.id}`}>View Details</Link>
              </article>
            )
          })
        )}
      </section>
    </main>
  )
}
