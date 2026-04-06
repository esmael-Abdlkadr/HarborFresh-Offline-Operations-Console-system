import { expect, test } from '@playwright/test'

async function loginAs(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

// Protected routes and who is denied:
// /dispatch — denied to all except Dispatcher, Administrator
// /campaigns — denied to all except Member, Administrator
// /courses — denied to all except Instructor, Member, Administrator
// /finance — denied to all except FinanceClerk, Administrator
// /admin — denied to all except Administrator

const deniedMatrix: Array<{ role: string; user: string; pass: string; route: string }> = [
  // Member denied routes
  { role: 'member', user: 'member', pass: 'HarborMember1!', route: '/dispatch' },
  // Dispatcher denied routes
  { role: 'dispatcher', user: 'dispatcher', pass: 'HarborDisp#1!', route: '/finance' },
  { role: 'dispatcher', user: 'dispatcher', pass: 'HarborDisp#1!', route: '/admin' },
  // FinanceClerk denied routes
  { role: 'finance', user: 'finance', pass: 'HarborFin#1!!', route: '/dispatch' },
  { role: 'finance', user: 'finance', pass: 'HarborFin#1!!', route: '/campaigns' },
  { role: 'finance', user: 'finance', pass: 'HarborFin#1!!', route: '/admin' },
  // Instructor denied routes
  { role: 'instructor', user: 'instructor', pass: 'HarborTeach#1!', route: '/dispatch' },
  { role: 'instructor', user: 'instructor', pass: 'HarborTeach#1!', route: '/campaigns' },
  { role: 'instructor', user: 'instructor', pass: 'HarborTeach#1!', route: '/finance' },
  { role: 'instructor', user: 'instructor', pass: 'HarborTeach#1!', route: '/admin' },
  // ContentEditor denied routes
  { role: 'editor', user: 'editor', pass: 'HarborEdit#1!', route: '/dispatch' },
  { role: 'editor', user: 'editor', pass: 'HarborEdit#1!', route: '/campaigns' },
  { role: 'editor', user: 'editor', pass: 'HarborEdit#1!', route: '/finance' },
  { role: 'editor', user: 'editor', pass: 'HarborEdit#1!', route: '/admin' },
]

for (const { role, user, pass, route } of deniedMatrix) {
  test(`${role} is denied access to ${route}`, async ({ page }) => {
    await loginAs(page, user, pass)
    await page.goto(route)
    await expect(page.getByText(/forbidden/i)).toBeVisible()
  })
}

// Allowed access smoke checks — verify page renders without forbidden
const allowedMatrix: Array<{ role: string; user: string; pass: string; route: string; marker: RegExp }> = [
  { role: 'dispatcher', user: 'dispatcher', pass: 'HarborDisp#1!', route: '/dispatch', marker: /dispatch board/i },
  { role: 'member', user: 'member', pass: 'HarborMember1!', route: '/campaigns', marker: /group-buy campaigns/i },
  { role: 'member', user: 'member', pass: 'HarborMember1!', route: '/courses', marker: /course registration/i },
  { role: 'finance', user: 'finance', pass: 'HarborFin#1!!', route: '/finance', marker: /finance/i },
  { role: 'admin', user: 'admin', pass: 'HarborAdmin#1!', route: '/admin', marker: /user management|admin/i },
]

for (const { role, user, pass, route, marker } of allowedMatrix) {
  test(`${role} is allowed access to ${route}`, async ({ page }) => {
    await loginAs(page, user, pass)
    await page.goto(route)
    await expect(page.getByText(marker).first()).toBeVisible()
  })
}
