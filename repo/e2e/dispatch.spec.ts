import { expect, test } from '@playwright/test'

function toLocalDateTimeValue(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

test('dispatcher can generate tasks from confirmed orders and auto-plan', async ({ page }) => {
  // Step 1: Admin creates a fish, campaign, and confirms an order
  await page.goto('/login')
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('HarborAdmin#1!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  // Create a fish entry
  await page.getByRole('link', { name: 'Fish Knowledge' }).click()
  await page.getByRole('button', { name: 'New Entry' }).click()
  const suffix = Date.now()
  await page.getByLabel('Common Name').fill(`Dispatch Fish ${suffix}`)
  await page.getByLabel('Scientific Name').fill(`Dispatchus ${suffix}`)
  await page.getByLabel('kingdom').fill('Animalia')
  await page.getByLabel('phylum').fill('Chordata')
  await page.getByLabel('class').fill('Actinopterygii')
  await page.getByLabel('order').fill('Perciformes')
  await page.getByLabel('family').fill('Testidae')
  await page.getByLabel('genus').fill('Testus')
  await page.getByLabel('species').fill('T. disp')
  await page.getByRole('button', { name: 'Save & Submit for Review' }).click()
  await expect(page).toHaveURL(/\/fish\//)
  await page.getByRole('button', { name: 'Workflow' }).click()
  await page.getByLabel(/reviewer comment/i).fill('approve dispatch fish')
  await page.getByRole('button', { name: 'Approve' }).click()

  // Create a campaign
  await page.getByRole('link', { name: 'Group Buys' }).click()
  const campaignTitle = `Dispatch Campaign ${suffix}`
  await page.getByLabel('Title').fill(campaignTitle)
  await page.getByLabel('Description').fill('dispatch test campaign')
  await page.getByLabel('Fish Entry').selectOption({ label: `Dispatch Fish ${suffix}` })
  await page.getByLabel('Price Per Unit').fill('10')
  await page.getByRole('textbox', { name: 'Unit' }).fill('lb')
  await page.getByLabel('Min Participants').fill('1')
  const cutoff = toLocalDateTimeValue(new Date(Date.now() + 60 * 60 * 1000))
  await page.getByLabel('Cutoff').fill(cutoff)
  await page.getByRole('button', { name: 'Create Campaign' }).click()
  await expect(page.getByText(campaignTitle)).toBeVisible()
  await page.getByRole('button', { name: 'Logout' }).click()

  // Step 2: Member joins the campaign
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
  await page.getByRole('button', { name: 'Logout' }).click()

  // Step 3: Admin confirms the order
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('HarborAdmin#1!')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.getByRole('link', { name: 'Group Buys' }).click()
  await page.locator('article.card').filter({ hasText: campaignTitle }).getByRole('link', { name: 'View Details' }).click()
  await page.getByRole('button', { name: 'Orders' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('dialog', { name: 'Confirm payment' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm Payment' }).click()
  await expect(page.getByText('Confirmed')).toBeVisible()
  await page.getByRole('button', { name: 'Logout' }).click()

  // Step 4: Dispatcher generates tasks from orders and auto-plans
  await page.getByLabel('Username').fill('dispatcher')
  await page.getByLabel('Password').fill('HarborDisp#1!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.getByRole('link', { name: 'Dispatch Board' }).click()
  await page.getByRole('button', { name: 'Generate from Orders' }).click()

  // Add a batch
  await page.getByRole('button', { name: 'Add Batch' }).click()
  await page.locator('.form label').filter({ hasText: 'Label' }).locator('input').fill('Delivery Van A')
  await page.locator('.form label').filter({ hasText: 'Reason' }).locator('textarea').fill('Creating batch for daily deliveries')
  await page.getByRole('button', { name: 'Create Batch' }).click()

  // Auto Plan now requires an operator-entered reason (min 10 chars)
  await page.getByRole('button', { name: 'Auto Plan' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('textbox').fill('Daily route auto-planning for test run')
  await page.getByRole('button', { name: /confirm/i }).click()
  await expect(page.getByText(/Delivery Van A/i)).toBeVisible()
})
