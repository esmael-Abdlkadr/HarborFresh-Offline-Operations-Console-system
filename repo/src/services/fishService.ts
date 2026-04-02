import { db } from '../db/db.ts'
import { notificationService } from './notificationService.ts'
import type { FishEntry, User } from '../types/index.ts'

type FishUpdate = Partial<FishEntry>

interface SaveOptions {
  customDiffSummary?: string
}

const REQUIRED_TAXONOMY_KEYS: Array<keyof FishEntry['taxonomy']> = [
  'kingdom',
  'phylum',
  'class',
  'order',
  'family',
  'genus',
  'species',
]

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function expectDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message)
  }
  return value
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim()
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function makeUniqueSlug(commonName: string, currentId?: number): Promise<string> {
  const baseSlug = slugify(commonName)
  assert(baseSlug.length > 0, 'Common name must contain letters or numbers.')

  let candidate = baseSlug
  let suffix = 2
  while (true) {
    const existing = await db.fishEntries.where('slug').equals(candidate).first()
    if (!existing || existing.id === currentId) {
      return candidate
    }
    candidate = `${baseSlug}-${suffix}`
    suffix += 1
  }
}

function changedFields(previous: FishEntry, next: FishEntry): string[] {
  const fields: string[] = []

  const topLevelKeys: Array<keyof FishEntry> = [
    'commonName',
    'scientificName',
    'morphologyNotes',
    'habitat',
    'distribution',
    'protectionLevel',
    'status',
    'scheduledPublishAt',
    'tags',
    'slug',
  ]

  for (const key of topLevelKeys) {
    const prev = previous[key]
    const curr = next[key]
    if (JSON.stringify(prev) !== JSON.stringify(curr)) {
      fields.push(key)
    }
  }

  for (const key of REQUIRED_TAXONOMY_KEYS) {
    if (previous.taxonomy[key] !== next.taxonomy[key]) {
      fields.push(`taxonomy.${key}`)
    }
  }

  if (previous.mediaAssets.length !== next.mediaAssets.length) {
    fields.push('mediaAssets')
  }

  return fields
}

async function addAudit(actor: User, action: string, fishId: number) {
  await db.auditLogs.add({
    actor: actor.username,
    action,
    entityType: 'FishEntry',
    entityId: String(fishId),
    timestamp: Date.now(),
  })
}

async function insertRevision(fishId: number, snapshot: FishEntry, actor: User, diffSummary: string) {
  await db.fishRevisions.add({
    fishId,
    version: snapshot.currentVersion,
    author: actor.id ?? 0,
    timestamp: Date.now(),
    diffSummary,
    snapshot: structuredClone(snapshot),
  })

  const revisions = await db.fishRevisions.where('fishId').equals(fishId).sortBy('version')
  if (revisions.length > 50) {
    const oldest = revisions[0]
    if (oldest?.id) {
      await db.fishRevisions.delete(oldest.id)
    }
  }
}

function ensureFishRequired(data: Partial<FishEntry>) {
  assert(normalizeText(data.commonName).length > 0, 'Common name is required.')
  assert(normalizeText(data.scientificName).length > 0, 'Scientific name is required.')

  const taxonomy = data.taxonomy
  assert(Boolean(taxonomy), 'Taxonomy is required.')
  for (const key of REQUIRED_TAXONOMY_KEYS) {
    const value = taxonomy?.[key]
    assert(normalizeText(value).length > 0, `Taxonomy ${key} is required.`)
  }
}

async function saveRevisionInternal(
  entryId: number,
  updates: FishUpdate,
  actor: User,
  options?: SaveOptions,
): Promise<FishEntry> {
  assert(actor.id !== undefined, 'Actor user id is required.')
  const existing = await db.fishEntries.get(entryId)
  const safeExisting = expectDefined(existing, 'Fish entry not found.')

  const merged: FishEntry = {
    ...safeExisting,
    ...updates,
    taxonomy: {
      ...safeExisting.taxonomy,
      ...(updates.taxonomy ?? {}),
    },
    mediaAssets: updates.mediaAssets ?? safeExisting.mediaAssets,
    tags: updates.tags ?? safeExisting.tags,
    currentVersion: safeExisting.currentVersion + 1,
    updatedAt: Date.now(),
  }

  if (updates.commonName && updates.commonName !== safeExisting.commonName) {
    merged.slug = await makeUniqueSlug(updates.commonName, entryId)
  }

  ensureFishRequired(merged)
  const changedSummary = changedFields(safeExisting, merged).join(', ')
  const diff = options?.customDiffSummary ?? (changedSummary || 'No field changes')

  await db.fishEntries.put({ ...merged, id: entryId })
  const saved = { ...merged, id: entryId }
  await insertRevision(entryId, saved, actor, diff)
  await addAudit(actor, 'FISH_REVISION_SAVED', entryId)
  return saved
}

export const fishService = {
  async createEntry(data: Partial<FishEntry>, actor: User): Promise<FishEntry> {
    assert(
      actor.role === 'ContentEditor' || actor.role === 'Administrator',
      'Only ContentEditor or Administrator can create fish entries.',
    )
    const actorId = expectDefined(actor.id, 'Actor user id is required.')
    ensureFishRequired(data)

    const now = Date.now()
    const commonName = normalizeText(data.commonName)
    const scientificName = normalizeText(data.scientificName)
    const slug = await makeUniqueSlug(commonName)

    const entry: FishEntry = {
      slug,
      commonName,
      scientificName,
      taxonomy: {
        kingdom: normalizeText(data.taxonomy?.kingdom),
        phylum: normalizeText(data.taxonomy?.phylum),
        class: normalizeText(data.taxonomy?.class),
        order: normalizeText(data.taxonomy?.order),
        family: normalizeText(data.taxonomy?.family),
        genus: normalizeText(data.taxonomy?.genus),
        species: normalizeText(data.taxonomy?.species),
      },
      morphologyNotes: normalizeText(data.morphologyNotes),
      habitat: normalizeText(data.habitat),
      distribution: normalizeText(data.distribution),
      protectionLevel: data.protectionLevel ?? 'None',
      mediaAssets: data.mediaAssets ?? [],
      status: 'draft',
      scheduledPublishAt: undefined,
      currentVersion: 1,
      tags: data.tags ?? [],
      createdBy: actorId,
      updatedAt: now,
    }

    const id = await db.fishEntries.add(entry)
    const created = { ...entry, id }

    await insertRevision(id, created, actor, 'Initial draft')
    await addAudit(actor, 'FISH_CREATED', id)
    return created
  },

  async saveRevision(
    entryId: number,
    updates: FishUpdate,
    actor: User,
    options?: SaveOptions,
  ): Promise<FishEntry> {
    assert(
      actor.role === 'ContentEditor' || actor.role === 'Administrator',
      'Only ContentEditor or Administrator can save fish revisions.',
    )
    return saveRevisionInternal(entryId, updates, actor, options)
  },

  async submitForReview(entryId: number, actor: User): Promise<void> {
    assert(
      actor.role === 'ContentEditor' || actor.role === 'Administrator',
      'Only editors and admins can submit for review.',
    )

    const entry = await db.fishEntries.get(entryId)
    const safeEntry = expectDefined(entry, 'Fish entry not found.')
    assert(
      safeEntry.status === 'draft' || safeEntry.status === 'rejected',
      'Entry must be draft or rejected before review.',
    )

    await saveRevisionInternal(entryId, { status: 'in_review' }, actor, {
      customDiffSummary: 'Submitted for review',
    })

    await notificationService.sendToRoles('FISH_REVIEW_REQUESTED', ['ContentReviewer'])
    await addAudit(actor, 'FISH_SUBMITTED_FOR_REVIEW', entryId)
  },

  async reviewEntry(
    entryId: number,
    decision: 'approve' | 'reject',
    comment: string,
    actor: User,
  ): Promise<void> {
    assert(
      actor.role === 'ContentReviewer' || actor.role === 'Administrator',
      'Only reviewers and admins can review entries.',
    )

    const entry = await db.fishEntries.get(entryId)
    const safeEntry = expectDefined(entry, 'Fish entry not found.')
    assert(safeEntry.status === 'in_review', 'Entry must be in review.')
    assert(normalizeText(comment).length > 0, 'Review comment is required.')

    if (decision === 'reject') {
      await saveRevisionInternal(entryId, { status: 'rejected' }, actor, {
        customDiffSummary: `Rejected: ${normalizeText(comment)}`,
      })

      if (safeEntry.createdBy) {
        await notificationService.send(safeEntry.createdBy, 'FISH_REJECTED', {
          fishName: safeEntry.commonName,
          reason: normalizeText(comment),
        })
      }

      await addAudit(actor, 'FISH_REJECTED', entryId)
      return
    }

    const refreshed = await db.fishEntries.get(entryId)
    const safeRefreshed = expectDefined(refreshed, 'Fish entry not found.')
    const scheduleTime = safeRefreshed.scheduledPublishAt

    if (scheduleTime && scheduleTime > Date.now()) {
      await saveRevisionInternal(entryId, { status: 'approved' }, actor, {
        customDiffSummary: `Approved with schedule: ${normalizeText(comment)}`,
      })
      await addAudit(actor, 'FISH_APPROVED', entryId)
      return
    }

    await saveRevisionInternal(entryId, { status: 'approved' }, actor, {
      customDiffSummary: `Approved: ${normalizeText(comment)}`,
    })
    await this.publishEntry(entryId, actor)
  },

  async publishEntry(entryId: number, actor?: User): Promise<void> {
    const entry = await db.fishEntries.get(entryId)
    expectDefined(entry, 'Fish entry not found.')

    const systemActor: User =
      actor ??
      ({
        id: 0,
        username: 'scheduler',
        role: 'Administrator',
        passwordHash: '',
        salt: '',
        failedAttempts: 0,
      } as User)

    await saveRevisionInternal(
      entryId,
      {
        status: 'published',
        scheduledPublishAt: undefined,
      },
      systemActor,
      {
        customDiffSummary: 'Published',
      },
    )
    await addAudit(systemActor, 'FISH_PUBLISHED', entryId)
  },

  async rollbackToVersion(entryId: number, targetVersion: number, actor: User): Promise<FishEntry> {
    const target = await db.fishRevisions
      .where('fishId')
      .equals(entryId)
      .and((revision) => revision.version === targetVersion)
      .first()

    const safeTarget = expectDefined(target, 'Target revision not found.')

    const snapshot = safeTarget.snapshot
    const restored = await this.saveRevision(
      entryId,
      {
        commonName: snapshot.commonName,
        scientificName: snapshot.scientificName,
        taxonomy: structuredClone(snapshot.taxonomy),
        morphologyNotes: snapshot.morphologyNotes,
        habitat: snapshot.habitat,
        distribution: snapshot.distribution,
        protectionLevel: snapshot.protectionLevel,
        mediaAssets: structuredClone(snapshot.mediaAssets),
        tags: [...snapshot.tags],
        status: 'draft',
        scheduledPublishAt: snapshot.scheduledPublishAt,
      },
      actor,
      {
        customDiffSummary: `Rollback to version ${targetVersion}`,
      },
    )

    await addAudit(actor, 'FISH_ROLLED_BACK', entryId)
    return restored
  },

  async processScheduledPublish() {
    const now = Date.now()
    const dueEntries = await db.fishEntries
      .where('status')
      .equals('approved')
      .and((entry) => Boolean(entry.scheduledPublishAt && entry.scheduledPublishAt <= now))
      .toArray()

    for (const entry of dueEntries) {
      if (!entry.id) {
        continue
      }
      await this.publishEntry(entry.id)
    }
  },
}
