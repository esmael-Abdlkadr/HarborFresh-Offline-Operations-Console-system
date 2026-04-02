import { expect, test } from '@playwright/test'

test('auth flow smoke', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)

  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('wrong')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByText(/invalid username or password/i)).toBeVisible()

  await page.getByLabel('Password').fill('HarborAdmin#1!')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(page).toHaveURL(/\/login/)
})
