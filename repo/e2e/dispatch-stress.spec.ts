import { expect, test } from '@playwright/test'

function toLocalDateTimeValue(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

async function loginAs(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function pointerDragToColumn(
  page: import('@playwright/test').Page,
  task: import('@playwright/test').Locator,
  column: import('@playwright/test').Locator,
) {
  await expect(task).toBeVisible({ timeout: 10000 })
  await expect(column).toBeVisible({ timeout: 10000 })
  try {
    await task.dragTo(column)
    return
  } catch {
    // Fall back to pointer-based drag for environments where dragTo is unreliable.
  }
  const taskBox = await task.boundingBox()
  const columnBox = await column.boundingBox()
  if (!taskBox || !columnBox) {
    throw new Error('Unable to compute drag/drop coordinates')
  }
  await page.mouse.move(taskBox.x + taskBox.width / 2, taskBox.y + taskBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 80, { steps: 20 })
  await page.mouse.up()
}

async function confirmReason(page: import('@playwright/test').Page, text: string) {
  const textbox = page.getByPlaceholder('Describe the reason for this change (min 10 characters)')
  await expect(textbox).toBeVisible({ timeout: 10000 })
  await textbox.fill(text)
  const dialog = textbox.locator('xpath=ancestor::*[@role="dialog"][1]')
  const confirmBtn = dialog.getByRole('button', { name: /^Confirm$/ })
  await expect(confirmBtn).toBeEnabled({ timeout: 10000 })
  await textbox.press('Tab')
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden({ timeout: 10000 })
}

async function createBatch(
  page: import('@playwright/test').Page,
  opts: { label: string; capacity: number; reason: string },
) {
  await page.getByRole('button', { name: 'Add Batch' }).click()
  await page.locator('.form label').filter({ hasText: 'Label' }).locator('input').fill(opts.label)
  await page
    .locator('.form label')
    .filter({ hasText: 'Vehicle Capacity (lbs)' })
    .locator('input')
    .fill(String(opts.capacity))
  await page
    .locator('.form label')
    .filter({ hasText: 'Shift Start (minutes from midnight)' })
    .locator('input')
    .fill('0')
  await page
    .locator('.form label')
    .filter({ hasText: 'Shift End (minutes from midnight)' })
    .locator('input')
    .fill('1439')
  await page.locator('.form label').filter({ hasText: 'Reason' }).locator('textarea').fill(opts.reason)
  await page.getByRole('button', { name: 'Create Batch' }).click()
  await expect(page.getByText(new RegExp(opts.label, 'i'))).toBeVisible({ timeout: 10000 })
}

async function ensureGeneratedUnassignedTask(page: import('@playwright/test').Page) {
  const unassignedColumn = page.getByTestId('drop-column-unassigned')
  const firstTask = unassignedColumn.locator('article').first()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByRole('button', { name: 'Generate from Orders' }).click()
    try {
      await expect(firstTask).toBeVisible({ timeout: 10000 })
      return
    } catch {
      await page.waitForTimeout(300)
    }
  }

  const uiError = await page.locator('.error').first().textContent()
  throw new Error(`No unassigned task appeared after generation attempts. UI error: ${uiError ?? 'none'}`)
}

test('dispatch stress: DnD assign/unassign/reassign with conflict and recalculate', async ({ page }) => {
  let dispatchDate = ''

  // ── Setup: admin creates fish + campaign, member joins, admin confirms ──
  await loginAs(page, 'admin', 'HarborAdmin#1!')

  await page.getByRole('link', { name: 'Fish Knowledge' }).click()
  await page.getByRole('button', { name: 'New Entry' }).click()
  const suffix = Date.now()
  await page.getByLabel('Common Name').fill(`Stress Fish ${suffix}`)
  await page.getByLabel('Scientific Name').fill(`Stressus ${suffix}`)
  await page.getByLabel('kingdom').fill('Animalia')
  await page.getByLabel('phylum').fill('Chordata')
  await page.getByLabel('class').fill('Actinopterygii')
  await page.getByLabel('order').fill('Perciformes')
  await page.getByLabel('family').fill('Testidae')
  await page.getByLabel('genus').fill('Testus')
  await page.getByLabel('species').fill('T. stress')
  await page.getByRole('button', { name: 'Save & Submit for Review' }).click()
  await expect(page).toHaveURL(/\/fish\//)
  await page.getByRole('button', { name: 'Workflow' }).click()
  await page.getByLabel(/reviewer comment/i).fill('approve stress fish')
  await page.getByRole('button', { name: 'Approve' }).click()

  await page.getByRole('link', { name: 'Group Buys' }).click()
  const title = `Stress Campaign ${suffix}`
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Description').fill('stress test campaign')
  await page.getByLabel('Fish Entry').selectOption({ label: `Stress Fish ${suffix}` })
  await page.getByLabel('Price Per Unit').fill('10')
  await page.getByRole('textbox', { name: 'Unit' }).fill('lb')
  await page.getByLabel('Min Participants').fill('1')
  await page.getByLabel('Cutoff').fill(toLocalDateTimeValue(new Date(Date.now() + 3600000)))
  await page.getByRole('button', { name: 'Create Campaign' }).click()
  await expect(page.getByText(title)).toBeVisible()
  await page.getByRole('button', { name: 'Logout' }).click()

  // Member joins
  await loginAs(page, 'member', 'HarborMember1!')
  await page.getByRole('link', { name: 'Group Buys' }).click()
  const card = page.locator('article.card').filter({ hasText: title })
  await expect(card.first()).toBeVisible()
  await card.first().scrollIntoViewIfNeeded()
  await card.first().getByRole('link', { name: 'View Details' }).first().click({ force: true })
  await page.getByRole('button', { name: 'Join Campaign' }).click()

  // Force deterministic pickup/delivery windows and capture the dispatch date
  // to avoid day-boundary flakiness around midnight.
  const nowMs = Date.now()
  const pickupStart = new Date(nowMs + 30 * 60 * 1000)
  const pickupEnd = new Date(nowMs + 60 * 60 * 1000)
  const deliveryStart = new Date(nowMs + 120 * 60 * 1000)
  const deliveryEnd = new Date(nowMs + 180 * 60 * 1000)
  dispatchDate = toLocalDateTimeValue(deliveryStart).slice(0, 10)

  const pickupWindow = page.locator('fieldset').filter({ hasText: 'Pickup Window' })
  await pickupWindow.locator('input[type="datetime-local"]').nth(0).fill(toLocalDateTimeValue(pickupStart))
  await pickupWindow.locator('input[type="datetime-local"]').nth(1).fill(toLocalDateTimeValue(pickupEnd))

  const deliveryWindow = page.locator('fieldset').filter({ hasText: 'Delivery Window' })
  await deliveryWindow.locator('input[type="datetime-local"]').nth(0).fill(toLocalDateTimeValue(deliveryStart))
  await deliveryWindow.locator('input[type="datetime-local"]').nth(1).fill(toLocalDateTimeValue(deliveryEnd))

  await page.getByLabel('Quantity').fill('2')
  await page.getByRole('button', { name: 'Confirm Join' }).click()
  await expect(page.getByText(/join request completed/i)).toBeVisible()
  await page.getByRole('button', { name: 'Logout' }).click()

  // Admin confirms order
  await loginAs(page, 'admin', 'HarborAdmin#1!')
  await page.getByRole('link', { name: 'Group Buys' }).click()
  const adminCard = page.locator('article.card').filter({ hasText: title })
  await expect(adminCard.first()).toBeVisible()
  await adminCard.first().scrollIntoViewIfNeeded()
  await adminCard.first().getByRole('link', { name: 'View Details' }).first().click({ force: true })
  await page.getByRole('button', { name: 'Orders' }).click()
  const orderRow = page.locator('table tbody tr').first()
  await expect(orderRow).toBeVisible({ timeout: 10000 })
  await orderRow.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('dialog', { name: 'Confirm payment' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm Payment' }).click()
  await expect(orderRow).toContainText('Confirmed')
  await page.getByRole('button', { name: 'Logout' }).click()

  // ── Dispatcher: generate tasks and run true DnD stress cycles ──
  await loginAs(page, 'dispatcher', 'HarborDisp#1!')
  await page.getByRole('link', { name: 'Dispatch Board' }).click()
  await page.locator('input[type="date"]').fill(dispatchDate)

  // Generate tasks from confirmed orders
  const unassignedColumn = page.getByTestId('drop-column-unassigned')
  await ensureGeneratedUnassignedTask(page)

  // Create a low-capacity batch to force a conflict during drag assignment.
  await createBatch(page, {
    label: 'Stress Van Tiny',
    capacity: 5,
    reason: 'Creating tiny-capacity batch for conflict validation',
  })
  const tinyColumn = page.locator('[data-testid^="drop-column-batch-"]').filter({
    hasText: 'Stress Van Tiny',
  })

  // Drag unassigned -> tiny batch (should conflict on capacity or time window).
  const initialUnassignedCount = await unassignedColumn.locator('article').count()
  const taskCard = unassignedColumn.locator('article').first()
  await pointerDragToColumn(page, taskCard, tinyColumn)
  await expect(page.getByText(/Conflict:/i)).toBeVisible({ timeout: 10000 })
  await expect(unassignedColumn.locator('article')).toHaveCount(initialUnassignedCount)

  // Create a normal batch and perform assign -> unassign -> reassign using DnD.
  await createBatch(page, {
    label: 'Stress Van Alpha',
    capacity: 400,
    reason: 'Creating normal batch for repeated DnD assignment cycle',
  })
  const alphaColumn = page.locator('[data-testid^="drop-column-batch-"]').filter({
    hasText: 'Stress Van Alpha',
  })

  // Assign
  await pointerDragToColumn(page, unassignedColumn.locator('article').first(), alphaColumn)
  await expect(alphaColumn.locator('article').first()).toBeVisible({ timeout: 10000 })

  // Unassign
  await pointerDragToColumn(page, alphaColumn.locator('article').first(), unassignedColumn)
  await expect(unassignedColumn.locator('article').first()).toBeVisible({ timeout: 10000 })

  // Reassign
  await pointerDragToColumn(page, unassignedColumn.locator('article').first(), alphaColumn)
  await expect(alphaColumn.locator('article').first()).toBeVisible({ timeout: 10000 })

  // Recalculate after repeated manual edits.
  await page.getByRole('button', { name: 'Recalculate' }).click()
  await confirmReason(page, 'Recalculate after repeated manual assign and unassign cycles')
  await expect(alphaColumn.locator('article').first()).toBeVisible({ timeout: 10000 })

  // Verify dispatch log panel has entries for the operations performed
  const logPanel = page.locator('details summary').filter({ hasText: /dispatch log/i })
  await logPanel.click()
  // The log table should have at least one row with timestamp/action data
  await expect(page.locator('details table tbody tr').first()).toBeVisible()
  await expect(page.locator('details table')).toContainText('MANUAL_ASSIGN')
  await expect(page.locator('details table')).toContainText('MANUAL_UNASSIGN')
  await expect(page.locator('details table')).toContainText('RECALCULATE')
})
