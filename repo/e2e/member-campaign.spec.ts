import { expect, test } from '@playwright/test'

function toLocalDateTimeValue(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

test('member can create a campaign', async ({ page }) => {
  // First admin creates and publishes a fish for the member to reference
  await page.goto('/login')
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('HarborAdmin#1!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.getByRole('link', { name: 'Fish Knowledge' }).click()
  await page.getByRole('button', { name: 'New Entry' }).click()
  const suffix = Date.now()
  await page.getByLabel('Common Name').fill(`MemberCamp Fish ${suffix}`)
  await page.getByLabel('Scientific Name').fill(`Memberus ${suffix}`)
  await page.getByLabel('kingdom').fill('Animalia')
  await page.getByLabel('phylum').fill('Chordata')
  await page.getByLabel('class').fill('Actinopterygii')
  await page.getByLabel('order').fill('Perciformes')
  await page.getByLabel('family').fill('Testidae')
  await page.getByLabel('genus').fill('Testus')
  await page.getByLabel('species').fill('T. mem')
  await page.getByRole('button', { name: 'Save & Submit for Review' }).click()
  await expect(page).toHaveURL(/\/fish\//)
  await page.getByRole('button', { name: 'Workflow' }).click()
  await page.getByLabel(/reviewer comment/i).fill('approve member camp fish')
  await page.getByRole('button', { name: 'Approve' }).click()

  await page.getByRole('button', { name: 'Logout' }).click()

  // Now member creates a campaign
  await page.getByLabel('Username').fill('member')
  await page.getByLabel('Password').fill('HarborMember1!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.getByRole('link', { name: 'Group Buys' }).click()

  const campaignTitle = `Member Started Campaign ${suffix}`
  await page.getByLabel('Title').fill(campaignTitle)
  await page.getByLabel('Description').fill('Member-created group buy')
  await page.getByLabel('Fish Entry').selectOption({ label: `MemberCamp Fish ${suffix}` })
  await page.getByLabel('Price Per Unit').fill('15.00')
  await page.getByRole('textbox', { name: 'Unit' }).fill('lb')
  await page.getByLabel('Min Participants').fill('2')
  const cutoff = toLocalDateTimeValue(new Date(Date.now() + 60 * 60 * 1000))
  await page.getByLabel('Cutoff').fill(cutoff)
  await page.getByRole('button', { name: 'Create Campaign' }).click()

  await expect(page.getByText(campaignTitle)).toBeVisible()
})
