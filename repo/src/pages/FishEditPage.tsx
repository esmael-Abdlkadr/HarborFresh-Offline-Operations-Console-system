import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '../db/db.ts'
import { useAuth } from '../hooks/useAuth.ts'
import { fishService } from '../services/fishService.ts'
import type { FishEntry, MediaAsset } from '../types/index.ts'

function createEmptyForm() {
  return {
    commonName: '',
    scientificName: '',
    taxonomy: {
      kingdom: '',
      phylum: '',
      class: '',
      order: '',
      family: '',
      genus: '',
      species: '',
    },
    morphologyNotes: '',
    habitat: '',
    distribution: '',
    protectionLevel: 'None' as FishEntry['protectionLevel'],
    tags: '',
    mediaAssets: [] as MediaAsset[],
  }
}

export default function FishEditPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { currentUser } = useAuth()
  const idParam = params.get('id')
  const editId = idParam ? Number(idParam) : NaN
  const isEditing = idParam !== null && Number.isFinite(editId) && editId > 0

  const [form, setForm] = useState(createEmptyForm)
  const [initialSignature, setInitialSignature] = useState('')
  const [loading, setLoading] = useState(isEditing)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isEditing) {
      return
    }

    void db.fishEntries.get(editId).then((entry) => {
      if (!entry) {
        setError('Entry not found.')
        setLoading(false)
        return
      }

      const next = {
        commonName: entry.commonName,
        scientificName: entry.scientificName,
        taxonomy: { ...entry.taxonomy },
        morphologyNotes: entry.morphologyNotes,
        habitat: entry.habitat,
        distribution: entry.distribution,
        protectionLevel: entry.protectionLevel,
        tags: entry.tags.join(', '),
        mediaAssets: entry.mediaAssets,
      }

      setForm(next)
      setInitialSignature(JSON.stringify(next))
      setLoading(false)
    })
  }, [editId, isEditing])

  const hasUnsavedChanges = useMemo(() => {
    if (!initialSignature) {
      return JSON.stringify(form) !== JSON.stringify(createEmptyForm())
    }
    return JSON.stringify(form) !== initialSignature
  }, [form, initialSignature])

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) {
        return
      }
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  function onMediaUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files) {
      return
    }

    const additions: MediaAsset[] = []
    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) {
        setError(`${file.name} exceeds 50MB and was skipped.`)
        continue
      }

      const mediaType = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('audio/')
          ? 'audio'
          : file.type.startsWith('video/')
            ? 'video'
            : null

      if (!mediaType) {
        setError(`${file.name} is not a supported media type.`)
        continue
      }

      additions.push({
        assetId: crypto.randomUUID(),
        type: mediaType,
        filename: file.name,
        size: file.size,
        blobRef: file,
      })
    }

    setForm((current) => ({
      ...current,
      mediaAssets: [...current.mediaAssets, ...additions],
    }))

    event.target.value = ''
  }

  async function persist(submitAfterSave: boolean) {
    setError(null)

    if (!currentUser) {
      setError('You must be logged in.')
      return
    }

    setSaving(true)
    try {
      const payload: Partial<FishEntry> = {
        commonName: form.commonName,
        scientificName: form.scientificName,
        taxonomy: form.taxonomy,
        morphologyNotes: form.morphologyNotes,
        habitat: form.habitat,
        distribution: form.distribution,
        protectionLevel: form.protectionLevel,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        mediaAssets: form.mediaAssets,
      }

      const entry = isEditing
        ? await fishService.saveRevision(editId, payload, currentUser)
        : await fishService.createEntry(payload, currentUser)

      if (submitAfterSave && entry.id) {
        await fishService.submitForReview(entry.id, currentUser)
      }

      navigate(`/fish/${entry.id}`, { replace: true })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save entry.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main className="page">Loading...</main>
  }

  return (
    <main className="page">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{isEditing ? 'Edit Fish Entry' : 'Create Fish Entry'}</h2>

        <form
          className="form"
          style={{ maxWidth: '100%' }}
          onSubmit={(event) => {
            event.preventDefault()
            void persist(false)
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.7rem' }}>
            <label>
              Common Name
              <input value={form.commonName} onChange={(event) => setForm((c) => ({ ...c, commonName: event.target.value }))} required />
            </label>
            <label>
              Scientific Name
              <input
                value={form.scientificName}
                onChange={(event) => setForm((c) => ({ ...c, scientificName: event.target.value }))}
                required
              />
            </label>
          </div>

          <h3>Taxonomy</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.7rem' }}>
            {Object.keys(form.taxonomy).map((key) => (
              <label key={key}>
                {key}
                <input
                  value={form.taxonomy[key as keyof typeof form.taxonomy]}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      taxonomy: {
                        ...current.taxonomy,
                        [key]: event.target.value,
                      },
                    }))
                  }
                  required
                />
              </label>
            ))}
          </div>

          <label>
            Morphology Notes
            <textarea
              value={form.morphologyNotes}
              onChange={(event) => setForm((c) => ({ ...c, morphologyNotes: event.target.value }))}
              rows={4}
            />
          </label>

          <label>
            Habitat
            <textarea value={form.habitat} onChange={(event) => setForm((c) => ({ ...c, habitat: event.target.value }))} rows={2} />
          </label>

          <label>
            Distribution
            <textarea
              value={form.distribution}
              onChange={(event) => setForm((c) => ({ ...c, distribution: event.target.value }))}
              rows={2}
            />
          </label>

          <label>
            Protection Level
            <select
              value={form.protectionLevel}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  protectionLevel: event.target.value as FishEntry['protectionLevel'],
                }))
              }
            >
              <option value="None">None</option>
              <option value="Protected">Protected</option>
              <option value="Endangered">Endangered</option>
              <option value="Critically Endangered">Critically Endangered</option>
            </select>
          </label>

          <label>
            Tags (comma separated)
            <input value={form.tags} onChange={(event) => setForm((c) => ({ ...c, tags: event.target.value }))} />
          </label>

          <label>
            Media Upload (image/audio/video, max 50MB each)
            <input type="file" multiple accept="image/*,audio/*,video/*" onChange={onMediaUpload} />
          </label>

          {form.mediaAssets.length > 0 && (
            <div className="card" style={{ background: 'var(--surface-soft)' }}>
              {form.mediaAssets.map((asset) => (
                <div key={asset.assetId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>
                    {asset.filename} ({asset.type})
                  </span>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        mediaAssets: current.mediaAssets.filter((item) => item.assetId !== asset.assetId),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn" disabled={saving} type="submit">
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button className="btn secondary" disabled={saving} type="button" onClick={() => void persist(true)}>
              Save &amp; Submit for Review
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
