import { expect, test } from '@playwright/test'

test('fish create submit approve workflow', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username').fill('editor')
  await page.getByLabel('Password').fill('HarborEdit#1!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.getByRole('link', { name: 'Fish Knowledge' }).click()
  await page.getByRole('button', { name: 'New Entry' }).click()

  const suffix = Date.now()
  await page.getByLabel('Common Name').fill(`E2E Fish ${suffix}`)
  await page.getByLabel('Scientific Name').fill(`Specius ${suffix}`)
  await page.getByLabel('kingdom').fill('Animalia')
  await page.getByLabel('phylum').fill('Chordata')
  await page.getByLabel('class').fill('Actinopterygii')
  await page.getByLabel('order').fill('Perciformes')
  await page.getByLabel('family').fill('Testidae')
  await page.getByLabel('genus').fill('Testus')
  await page.getByLabel('species').fill('T. spec')
  await page.getByRole('button', { name: 'Save & Submit for Review' }).click()
  await expect(page).toHaveURL(/\/fish\//)
  await page.getByRole('button', { name: 'Workflow' }).click()
  await expect(page.getByText(/current status:\s*in_review/i)).toBeVisible()

  await page.getByRole('button', { name: 'Logout' }).click()
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('HarborAdmin#1!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.getByRole('link', { name: 'Fish Knowledge' }).click()
  await page.getByText(`E2E Fish ${suffix}`).click()
  await page.getByRole('button', { name: 'Workflow' }).click()
  await page.getByLabel(/reviewer comment/i).fill('Approve via e2e smoke test')
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText(/current status:\s*published/i)).toBeVisible()
})
