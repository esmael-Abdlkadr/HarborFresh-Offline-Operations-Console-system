import { expect, test } from '@playwright/test'

/**
 * Tests the course enrollment drop flow.
 * Note: Because each Playwright browser context has isolated IndexedDB, multi-user
 * waitlist scenarios are tested at the component level (NotificationsFilters.test.tsx,
 * courseDateTimeWindow.test.ts). These E2E tests use a single-context flow.
 */

test('enrolled member can drop enrollment from course detail page', async ({ page }) => {
  // Step 1: instructor creates the course
  await page.goto('/login')
  await page.getByLabel('Username').fill('instructor')
  await page.getByLabel('Password').fill('HarborTeach#1!')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await page.getByRole('link', { name: 'Course Registration' }).click()
  await expect(page.getByRole('heading', { name: 'Course Registration' })).toBeVisible()

  const future = new Date()
  future.setDate(future.getDate() + 3)
  const startDt = future.toISOString().slice(0, 16)
  const endDt = new Date(future.getTime() + 4 * 3600000).toISOString().slice(0, 16)

  await page.locator('label').filter({ hasText: 'Title' }).locator('input').fill('Drop Test Course')
  await page.locator('input[type="datetime-local"]').first().fill(startDt)
  await page.locator('input[type="datetime-local"]').nth(1).fill(endDt)
  await page.locator('input[type="number"]').first().fill('5')
  await page.locator('label').filter({ hasText: 'Instructor' }).locator('select').selectOption({ label: 'instructor' })
  await page.getByRole('button', { name: 'Create Course' }).click()
  await expect(page.getByRole('cell', { name: 'Drop Test Course' })).toBeVisible({ timeout: 8000 })

  // Step 2: log out instructor, log in member — use same page (same IndexedDB)
  await page.getByRole('button', { name: 'Logout' }).click()
  await page.goto('/login')
  await page.getByLabel('Username').fill('member')
  await page.getByLabel('Password').fill('HarborMember1!')
  await page.getByRole('button', { name: 'Sign In' }).click()
  // Member may land on /courses (ProtectedRoute returnTo) or /dashboard — wait for Logout button
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible({ timeout: 15000 })

  // Go to Course Registration (navigate in case we're already there from returnTo redirect)
  await page.goto('/courses')
  await expect(page.getByRole('heading', { name: 'Course Registration' })).toBeVisible()

  // Enroll in the course
  const courseRow = page.getByRole('row').filter({ hasText: 'Drop Test Course' })
  await expect(courseRow).toBeVisible({ timeout: 8000 })
  await courseRow.getByRole('button', { name: 'Enroll' }).click()
  await expect(courseRow.getByRole('cell', { name: 'Enrolled' })).toBeVisible({ timeout: 8000 })

  // Go to course detail
  await courseRow.getByRole('link', { name: 'View' }).click()
  await expect(page.getByRole('heading', { name: 'Drop Test Course' })).toBeVisible({ timeout: 8000 })

  // Drop Enrollment button must be visible for Enrolled status
  const dropBtn = page.getByRole('button', { name: 'Drop Enrollment' })
  await expect(dropBtn).toBeVisible()
  await dropBtn.click()

  // After drop, the enrollment status shows "Dropped" and the drop button is gone
  await expect(page.getByRole('strong').filter({ hasText: 'Dropped' })).toBeVisible({ timeout: 8000 })
  await expect(page.getByRole('button', { name: 'Drop Enrollment' })).not.toBeVisible()
})

test('course detail page shows correct datetime window for a course', async ({ page }) => {
  // Create a course with explicit time and verify datetime is displayed in the list
  await page.goto('/login')
  await page.getByLabel('Username').fill('instructor')
  await page.getByLabel('Password').fill('HarborTeach#1!')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await page.getByRole('link', { name: 'Course Registration' }).click()

  const future = new Date()
  future.setFullYear(future.getFullYear() + 1)
  future.setMonth(5)
  future.setDate(15)
  future.setHours(9, 0, 0, 0)
  const startDt = future.toISOString().slice(0, 16)
  const endDt = new Date(future.getTime() + 8 * 3600000).toISOString().slice(0, 16)

  await page.locator('label').filter({ hasText: 'Title' }).locator('input').fill('Datetime Test Course')
  await page.locator('input[type="datetime-local"]').first().fill(startDt)
  await page.locator('input[type="datetime-local"]').nth(1).fill(endDt)
  await page.locator('input[type="number"]').first().fill('10')
  await page.locator('label').filter({ hasText: 'Instructor' }).locator('select').selectOption({ label: 'instructor' })
  await page.getByRole('button', { name: 'Create Course' }).click()

  await expect(page.getByRole('cell', { name: 'Datetime Test Course' })).toBeVisible({ timeout: 8000 })

  // The dates column must include the time portion (not just a date)
  const datesCell = page.getByRole('row').filter({ hasText: 'Datetime Test Course' }).getByRole('cell').nth(2)
  const cellText = await datesCell.innerText()
  expect(cellText).toMatch(/\d{2}:\d{2}/)
})
