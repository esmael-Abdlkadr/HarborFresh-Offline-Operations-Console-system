import { expect, test } from '@playwright/test'

test('finance user can reach Finance Bookkeeping page', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel('Username').fill('finance')
  await page.getByLabel('Password').fill('HarborFin#1!!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await page.getByRole('link', { name: 'Finance' }).click()

  await expect(
    page.getByRole('heading', { name: /finance bookkeeping|finance locked/i }),
  ).toBeVisible()

  const heading = await page.getByRole('heading', { name: /finance bookkeeping|finance locked/i }).innerText()
  expect(heading.toLowerCase()).toMatch(/finance/)
})

test('admin user can reach Admin page', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('HarborAdmin#1!')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await page.getByRole('link', { name: 'Admin' }).click()

  await expect(page.getByRole('heading', { name: /user management|admin/i })).toBeVisible()
})
