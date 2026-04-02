// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedIfEmpty } from '../db/seed.ts'
import { fishService } from './fishService.ts'

async function getUser(username: string) {
  const user = await db.users.where('username').equals(username).first()
  if (!user) {
    throw new Error(`User ${username} not found`)
  }
  return user
}

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  await seedIfEmpty()
})

describe('fishService', () => {
  it('creates, updates, and submits fish entry for review', async () => {
    const editor = await getUser('editor')

    const created = await fishService.createEntry(
      {
        commonName: 'Pacific Herring',
        scientificName: 'Clupea pallasii',
        taxonomy: {
          kingdom: 'Animalia',
          phylum: 'Chordata',
          class: 'Actinopterygii',
          order: 'Clupeiformes',
          family: 'Clupeidae',
          genus: 'Clupea',
          species: 'C. pallasii',
        },
      },
      editor,
    )

    expect(created.status).toBe('draft')

    const revised = await fishService.saveRevision(
      created.id!,
      { habitat: 'Coastal waters', morphologyNotes: 'Silvery body and forked tail.' },
      editor,
    )
    expect(revised.currentVersion).toBe(2)

    await fishService.submitForReview(created.id!, editor)
    const updated = await db.fishEntries.get(created.id!)
    expect(updated?.status).toBe('in_review')
  })

  it('approves scheduled entry and publishes via scheduler at due time', async () => {
    const editor = await getUser('editor')
    const reviewer = await getUser('reviewer')

    const created = await fishService.createEntry(
      {
        commonName: 'Lingcod',
        scientificName: 'Ophiodon elongatus',
        taxonomy: {
          kingdom: 'Animalia',
          phylum: 'Chordata',
          class: 'Actinopterygii',
          order: 'Scorpaeniformes',
          family: 'Hexagrammidae',
          genus: 'Ophiodon',
          species: 'O. elongatus',
        },
      },
      editor,
    )

    const due = Date.now() + 90_000
    await fishService.saveRevision(created.id!, { scheduledPublishAt: due }, editor)
    await fishService.submitForReview(created.id!, editor)

    await fishService.reviewEntry(created.id!, 'approve', 'Looks good for release.', reviewer)
    const approved = await db.fishEntries.get(created.id!)
    expect(approved?.status).toBe('approved')

    await fishService.processScheduledPublish()
    const stillApproved = await db.fishEntries.get(created.id!)
    expect(stillApproved?.status).toBe('approved')

    await db.fishEntries.update(created.id!, { scheduledPublishAt: Date.now() - 1_000 })
    await fishService.processScheduledPublish()
    const published = await db.fishEntries.get(created.id!)
    expect(published?.status).toBe('published')
  })

  it('rollback creates new revision and preserves history', async () => {
    const editor = await getUser('editor')

    const created = await fishService.createEntry(
      {
        commonName: 'Coho Salmon',
        scientificName: 'Oncorhynchus kisutch',
        taxonomy: {
          kingdom: 'Animalia',
          phylum: 'Chordata',
          class: 'Actinopterygii',
          order: 'Salmoniformes',
          family: 'Salmonidae',
          genus: 'Oncorhynchus',
          species: 'O. kisutch',
        },
        habitat: 'Open ocean',
      },
      editor,
    )

    await fishService.saveRevision(created.id!, { habitat: 'River mouths' }, editor)
    await fishService.saveRevision(created.id!, { habitat: 'Cold coastal waters' }, editor)

    const rolled = await fishService.rollbackToVersion(created.id!, 2, editor)
    expect(rolled.habitat).toBe('River mouths')

    const revisions = await db.fishRevisions.where('fishId').equals(created.id!).toArray()
    expect(revisions.length).toBeGreaterThanOrEqual(4)
  })

  it('enforces revision cap at 50 and drops oldest', async () => {
    const editor = await getUser('editor')

    const created = await fishService.createEntry(
      {
        commonName: 'Black Rockfish',
        scientificName: 'Sebastes melanops',
        taxonomy: {
          kingdom: 'Animalia',
          phylum: 'Chordata',
          class: 'Actinopterygii',
          order: 'Scorpaeniformes',
          family: 'Sebastidae',
          genus: 'Sebastes',
          species: 'S. melanops',
        },
      },
      editor,
    )

    for (let i = 0; i < 51; i += 1) {
      await fishService.saveRevision(created.id!, { morphologyNotes: `note-${i}` }, editor)
    }

    const revisions = await db.fishRevisions.where('fishId').equals(created.id!).sortBy('version')
    expect(revisions).toHaveLength(50)
    expect(revisions[0]?.version).toBe(3)
  }, 15_000)
})
