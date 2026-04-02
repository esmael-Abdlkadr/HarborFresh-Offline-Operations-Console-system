import { expect, test } from '@playwright/test'

async function loginAs(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

/** Insert a fish entry directly into IndexedDB and return its id. */
async function insertFish(
  page: import('@playwright/test').Page,
  overrides: { status?: string; commonName?: string } = {},
): Promise<number> {
  return page.evaluate(async (opts) => {
    const { db } = await import('/src/db/db.ts')
    const now = Date.now()
    return db.fishEntries.add({
      slug: `test-fish-${now}`,
      commonName: opts.commonName ?? 'Test Fish',
      scientificName: 'Testus fishus',
      taxonomy: {
        kingdom: 'Animalia',
        phylum: 'Chordata',
        class: 'Actinopterygii',
        order: 'Perciformes',
        family: 'Testidae',
        genus: 'Testus',
        species: 'T. fishus',
      },
      morphologyNotes: '',
      habitat: '',
      distribution: '',
      protectionLevel: 'None',
      mediaAssets: [],
      status: opts.status ?? 'draft',
      currentVersion: 1,
      tags: [],
      createdBy: 1,
      updatedAt: now,
    } as Parameters<typeof db.fishEntries.add>[0])
  }, overrides)
}

// ─── Fish list status filter visibility ──────────────────────────────────────

test('member fish list does not show status filter', async ({ page }) => {
  await loginAs(page, 'member', 'HarborMember1!')
  await page.goto('/fish')
  // The status filter select shows "All Statuses" option — not present for non-editorial
  await expect(page.getByRole('combobox').filter({ hasText: /all statuses/i })).not.toBeVisible()
})

test('content editor fish list shows status filter', async ({ page }) => {
  await loginAs(page, 'editor', 'HarborEdit#1!')
  await page.goto('/fish')
  await expect(page.getByRole('combobox').filter({ hasText: /all statuses/i })).toBeVisible()
})

test('admin fish list shows status filter', async ({ page }) => {
  await loginAs(page, 'admin', 'HarborAdmin#1!')
  await page.goto('/fish')
  await expect(page.getByRole('combobox').filter({ hasText: /all statuses/i })).toBeVisible()
})

// ─── Direct-URL access control ───────────────────────────────────────────────

test('member cannot view a draft fish entry by direct URL', async ({ page }) => {
  // Set up: insert a draft fish entry as a privileged page context
  await loginAs(page, 'editor', 'HarborEdit#1!')
  const fishId = await insertFish(page, { status: 'draft', commonName: 'Secret Draft Fish' })

  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(page).toHaveURL(/\/login/)

  await loginAs(page, 'member', 'HarborMember1!')
  await page.goto(`/fish/${fishId}`)

  await expect(page.getByText(/not found/i)).toBeVisible()
  await expect(page.getByText('Secret Draft Fish')).not.toBeVisible()
})

test('member cannot see Workflow or Version History tabs on a published fish detail page', async ({
  page,
}) => {
  await loginAs(page, 'editor', 'HarborEdit#1!')
  const fishId = await insertFish(page, { status: 'published', commonName: 'Published Fish' })

  await page.getByRole('button', { name: 'Logout' }).click()
  await loginAs(page, 'member', 'HarborMember1!')
  await page.goto(`/fish/${fishId}`)

  // Entry is published, so member CAN see it — but not editorial tabs
  await expect(page.getByText('Published Fish')).toBeVisible()
  await expect(page.getByRole('button', { name: /workflow/i })).not.toBeVisible()
  await expect(page.getByRole('button', { name: /version history/i })).not.toBeVisible()
})

// ─── Role access to /fish/new ─────────────────────────────────────────────────

test('dispatcher cannot access fish/new (editor+admin only)', async ({ page }) => {
  await loginAs(page, 'dispatcher', 'HarborDisp#1!')
  await page.goto('/fish/new')
  await expect(page.getByText(/forbidden/i)).toBeVisible()
})
