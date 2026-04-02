import { expect, test } from '@playwright/test'

async function loginAs(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

test('finance user cannot access courses/:id directly', async ({ page }) => {
  await loginAs(page, 'finance', 'HarborFin#1!!')
  await page.goto('/courses/999')
  await expect(page.getByText(/forbidden/i)).toBeVisible()
})

test('member cannot access admin page directly', async ({ page }) => {
  await loginAs(page, 'member', 'HarborMember1!')
  await page.goto('/admin')
  await expect(page.getByText(/forbidden/i)).toBeVisible()
})

test('member cannot access finance page directly', async ({ page }) => {
  await loginAs(page, 'member', 'HarborMember1!')
  await page.goto('/finance')
  await expect(page.getByText(/forbidden/i)).toBeVisible()
})

test('dispatcher cannot access campaigns directly', async ({ page }) => {
  await loginAs(page, 'dispatcher', 'HarborDisp#1!')
  await page.goto('/campaigns')
  await expect(page.getByText(/forbidden/i)).toBeVisible()
})

test('unauthenticated user redirects to login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})
