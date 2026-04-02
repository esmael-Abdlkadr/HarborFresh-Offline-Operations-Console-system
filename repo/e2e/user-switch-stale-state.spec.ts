import { expect, test } from '@playwright/test'

test('finance content does not persist after logout and re-login as member', async ({ page }) => {
  // Step 1: log in as finance user and navigate to /finance
  await page.goto('/login')
  await page.getByLabel('Username').fill('finance')
  await page.getByLabel('Password').fill('HarborFin#1!!')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await page.getByRole('link', { name: 'Finance' }).click()
  // Finance page loads (either Locked or Bookkeeping heading)
  await expect(
    page.getByRole('heading', { name: /finance bookkeeping|finance locked/i }),
  ).toBeVisible()

  // Step 2: log out without reloading
  await page.getByRole('button', { name: 'Logout' }).click()
  // Navigate explicitly to /login to clear any returnTo state set by ProtectedRoute
  await page.goto('/login')
  await expect(page).toHaveURL(/\/login/)

  // Step 3: log in as member (no Finance access)
  await page.getByLabel('Username').fill('member')
  await page.getByLabel('Password').fill('HarborMember1!')
  await page.getByRole('button', { name: 'Sign In' }).click()
  // Wait until logged in, then navigate to dashboard explicitly
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible({ timeout: 15000 })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  // Step 4: Finance link should not appear in member sidebar
  const financeLink = page.getByRole('link', { name: 'Finance' })
  await expect(financeLink).not.toBeVisible()

  // Step 5: direct navigation to /finance should render Forbidden
  await page.goto('/finance')
  await expect(page.getByText(/forbidden|not authorized|access denied/i)).toBeVisible()
})

test('localStorage is empty after logout', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('HarborAdmin#1!')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  // Check session data is present
  const beforeLogout = await page.evaluate(() => Object.keys(localStorage))
  expect(beforeLogout.length).toBeGreaterThan(0)

  // Log out
  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(page).toHaveURL(/\/login/)

  // localStorage must be cleared
  const afterLogout = await page.evaluate(() => Object.keys(localStorage))
  expect(afterLogout).toHaveLength(0)
})
