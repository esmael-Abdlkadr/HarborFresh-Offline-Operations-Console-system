import { expect, test } from '@playwright/test'

function toLocalDateTimeValue(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

test('campaign creation and member join', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('HarborAdmin#1!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.getByRole('link', { name: 'Fish Knowledge' }).click()
  await page.getByRole('button', { name: 'New Entry' }).click()
  const fishSuffix = Date.now()
  await page.getByLabel('Common Name').fill(`Campaign Fish ${fishSuffix}`)
  await page.getByLabel('Scientific Name').fill(`Campaignus ${fishSuffix}`)
  await page.getByLabel('kingdom').fill('Animalia')
  await page.getByLabel('phylum').fill('Chordata')
  await page.getByLabel('class').fill('Actinopterygii')
  await page.getByLabel('order').fill('Perciformes')
  await page.getByLabel('family').fill('Testidae')
  await page.getByLabel('genus').fill('Testus')
  await page.getByLabel('species').fill('T. camp')
  await page.getByRole('button', { name: 'Save & Submit for Review' }).click()
  await expect(page).toHaveURL(/\/fish\//)
  await page.getByRole('button', { name: 'Workflow' }).click()
  await page.getByLabel(/reviewer comment/i).fill('approve campaign fish')
  await page.getByRole('button', { name: 'Approve' }).click()

  await page.getByRole('link', { name: 'Group Buys' }).click()
  const campaignTitle = `E2E Campaign ${fishSuffix}`
  await page.getByLabel('Title').fill(campaignTitle)
  await page.getByLabel('Description').fill('e2e campaign')
  await page.getByLabel('Fish Entry').selectOption({ label: `Campaign Fish ${fishSuffix}` })
  await page.getByLabel('Price Per Unit').fill('9.99')
  await page.getByRole('textbox', { name: 'Unit' }).fill('lb')
  await page.getByLabel('Min Participants').fill('1')
  const cutoff = toLocalDateTimeValue(new Date(Date.now() + 60 * 60 * 1000))
  await page.getByLabel('Cutoff').fill(cutoff)
  await page.getByRole('button', { name: 'Create Campaign' }).click()
  await expect(page.getByText(campaignTitle)).toBeVisible()

  await page.getByRole('button', { name: 'Logout' }).click()
  await page.getByLabel('Username').fill('member')
  await page.getByLabel('Password').fill('HarborMember1!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.getByRole('link', { name: 'Group Buys' }).click()
  const card = page.locator('article.card').filter({ hasText: campaignTitle })
  await card.getByRole('link', { name: 'View Details' }).click()
  await page.getByRole('button', { name: 'Join Campaign' }).click()
  await page.getByLabel('Quantity').fill('2')
  await page.getByRole('button', { name: 'Confirm Join' }).click()
  await expect(page.getByText(/join request completed/i)).toBeVisible()
  await page.getByRole('button', { name: 'My Order' }).click()
  await expect(page.getByText(/quantity: 2/i)).toBeVisible()
})
