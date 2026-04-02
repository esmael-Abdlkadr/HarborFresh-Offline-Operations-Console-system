import { expect, test } from '@playwright/test'

// Helpers
async function loginAs(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

/**
 * Simulate what happens to a fresh admin: set mustChangePassword=true in IndexedDB
 * directly via the page context. This lets us test the ProtectedRoute gate without
 * actually running through the full fresh-install flow (which the test seed bypasses).
 */
async function setMustChangePassword(
  page: import('@playwright/test').Page,
  username: string,
  value: boolean,
) {
  await page.evaluate(
    async ({ username, value }) => {
      const { db } = await import('/src/db/db.ts')
      const user = await db.users.where('username').equals(username).first()
      if (user?.id) {
        await db.users.update(user.id, { mustChangePassword: value })
      }
    },
    { username, value },
  )
}

// ─── Unauthenticated access ──────────────────────────────────────────────────

test('unauthenticated user is redirected to /login when hitting /bootstrap-setup', async ({
  page,
}) => {
  await page.goto('/bootstrap-setup')
  await expect(page).toHaveURL(/\/login/)
})

// ─── Bootstrap gate redirect ─────────────────────────────────────────────────

test('admin with mustChangePassword=true is redirected to /bootstrap-setup on /dashboard', async ({
  page,
}) => {
  await loginAs(page, 'admin', 'HarborAdmin#1!')
  await setMustChangePassword(page, 'admin', true)

  // Navigate to a protected route; ProtectedRoute should intercept and redirect.
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/bootstrap-setup/)
  await expect(page.getByRole('heading', { name: /set your admin password/i })).toBeVisible()

  // Reset for subsequent tests
  await setMustChangePassword(page, 'admin', false)
})

test('admin with mustChangePassword=true can access /bootstrap-setup without redirect loop', async ({
  page,
}) => {
  await loginAs(page, 'admin', 'HarborAdmin#1!')
  await setMustChangePassword(page, 'admin', true)

  await page.goto('/bootstrap-setup')
  // Must not redirect away — should stay on the setup page
  await expect(page).toHaveURL(/\/bootstrap-setup/)
  await expect(page.getByRole('heading', { name: /set your admin password/i })).toBeVisible()

  await setMustChangePassword(page, 'admin', false)
})

test('admin with mustChangePassword=true cannot bypass gate via /admin direct URL', async ({
  page,
}) => {
  await loginAs(page, 'admin', 'HarborAdmin#1!')
  await setMustChangePassword(page, 'admin', true)

  await page.goto('/admin')
  await expect(page).toHaveURL(/\/bootstrap-setup/)

  await setMustChangePassword(page, 'admin', false)
})

// ─── Bootstrap setup form ────────────────────────────────────────────────────

test('bootstrap setup form shows validation errors for short password', async ({ page }) => {
  await loginAs(page, 'admin', 'HarborAdmin#1!')
  await setMustChangePassword(page, 'admin', true)

  await page.goto('/bootstrap-setup')
  await page.getByLabel(/new password/i).fill('short')
  await page.getByLabel(/confirm password/i).fill('short')
  // Remove the HTML5 minlength attribute so the browser doesn't swallow the
  // submit event before React's onSubmit handler can display the error message.
  await page.getByLabel(/new password/i).evaluate((el) => el.removeAttribute('minlength'))
  await page.getByRole('button', { name: /set password/i }).click()

  await expect(page.getByText(/at least 12 characters/i)).toBeVisible()

  await setMustChangePassword(page, 'admin', false)
})

test('bootstrap setup form shows error when passwords do not match', async ({ page }) => {
  await loginAs(page, 'admin', 'HarborAdmin#1!')
  await setMustChangePassword(page, 'admin', true)

  await page.goto('/bootstrap-setup')
  await page.getByLabel(/new password/i).fill('CorrectHorseBatteryStaple1!')
  await page.getByLabel(/confirm password/i).fill('DifferentPass1234!!')
  await page.getByRole('button', { name: /set password/i }).click()

  await expect(page.getByText(/do not match/i)).toBeVisible()

  await setMustChangePassword(page, 'admin', false)
})

test('completing bootstrap setup clears gate and redirects to /dashboard', async ({ page }) => {
  await loginAs(page, 'admin', 'HarborAdmin#1!')
  await setMustChangePassword(page, 'admin', true)

  await page.goto('/bootstrap-setup')
  const newPassword = 'NewSecureAdmin#99!'
  await page.getByLabel(/new password/i).fill(newPassword)
  await page.getByLabel(/confirm password/i).fill(newPassword)
  await page.getByRole('button', { name: /set password/i }).click()

  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  // Subsequent navigation should no longer redirect to bootstrap-setup
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin/)
})
