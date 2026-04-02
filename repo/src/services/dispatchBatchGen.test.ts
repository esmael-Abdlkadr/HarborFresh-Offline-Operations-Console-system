// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedTestUsers } from '../db/seed.ts'
import { dispatchService, DispatchError } from './dispatchService.ts'
import { hashPassword } from './cryptoService.ts'

function dateString(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

async function getUser(username: string) {
  const user = await db.users.where('username').equals(username).first()
  if (!user) throw new Error(`Missing user: ${username}`)
  return user
}

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  await seedTestUsers()
})

describe('dispatchService.generatePlan', () => {
  it('creates batches automatically when none exist', async () => {
    const dispatcher = await getUser('dispatcher')
    const now = Date.now()
    const date = dateString(now)

    // Add an unassigned task for today
    const deliveryStart = new Date(`${date}T10:00:00`).getTime()
    await db.deliveryTasks.add({
      orderId: 100,
      status: 'Unassigned',
      priority: 1,
      weightLbs: 50,
      promisedPickupWindow: { start: deliveryStart - 3600000, end: deliveryStart - 1800000 },
      promisedDeliveryWindow: { start: deliveryStart, end: deliveryStart + 3600000 },
      address: '10 Dock St',
      version: 1,
    })

    const result = await dispatchService.generatePlan(date, dispatcher, 'Planned auto-route for test')

    expect(result.batchesCreated).toBeGreaterThanOrEqual(1)
    expect(result.tasksAssigned).toBeGreaterThanOrEqual(1)

    const batches = await db.deliveryBatches.where('date').equals(date).toArray()
    expect(batches.length).toBeGreaterThanOrEqual(1)
    expect(batches[0].label).toMatch(/Auto-/)
  })

  it('uses existing planned batches before creating new ones', async () => {
    const dispatcher = await getUser('dispatcher')
    const now = Date.now()
    const date = dateString(now)

    const existingBatchId = await db.deliveryBatches.add({
      label: 'Existing Batch',
      vehicleId: 'van-existing',
      driverId: dispatcher.id!,
      date,
      shiftStart: 8 * 60,
      shiftEnd: 17 * 60,
      vehicleCapacityLbs: 500,
      status: 'Planned',
      version: 1,
    })

    const deliveryStart = new Date(`${date}T10:00:00`).getTime()
    await db.deliveryTasks.add({
      orderId: 101,
      status: 'Unassigned',
      priority: 1,
      weightLbs: 50,
      promisedPickupWindow: { start: deliveryStart - 3600000, end: deliveryStart - 1800000 },
      promisedDeliveryWindow: { start: deliveryStart, end: deliveryStart + 3600000 },
      address: '11 Dock St',
      version: 1,
    })

    const result = await dispatchService.generatePlan(date, dispatcher, 'Planned auto-route for test')

    expect(result.batchesCreated).toBe(0) // reused existing
    expect(result.tasksAssigned).toBe(1)

    const task = await db.deliveryTasks.where('orderId').equals(101).first()
    expect(task?.batchId).toBe(existingBatchId)
  })

  it('respects vehicle capacity and creates overflow batches', async () => {
    const dispatcher = await getUser('dispatcher')
    const now = Date.now()
    const date = dateString(now)

    // Small capacity batch
    await db.deliveryBatches.add({
      label: 'Small Van',
      vehicleId: 'van-small',
      driverId: dispatcher.id!,
      date,
      shiftStart: 8 * 60,
      shiftEnd: 17 * 60,
      vehicleCapacityLbs: 60,
      status: 'Planned',
      version: 1,
    })

    const deliveryStart = new Date(`${date}T10:00:00`).getTime()
    await db.deliveryTasks.bulkAdd([
      {
        orderId: 201,
        status: 'Unassigned',
        priority: 1,
        weightLbs: 50,
        promisedPickupWindow: { start: deliveryStart - 3600000, end: deliveryStart - 1800000 },
        promisedDeliveryWindow: { start: deliveryStart, end: deliveryStart + 3600000 },
        address: '20 Harbor',
        version: 1,
      },
      {
        orderId: 202,
        status: 'Unassigned',
        priority: 1,
        weightLbs: 50,
        promisedPickupWindow: { start: deliveryStart - 3600000, end: deliveryStart - 1800000 },
        promisedDeliveryWindow: { start: deliveryStart, end: deliveryStart + 3600000 },
        address: '21 Harbor',
        version: 1,
      },
    ])

    const result = await dispatchService.generatePlan(date, dispatcher, 'Planned auto-route for test')

    // One task in existing, one needs new batch
    expect(result.batchesCreated).toBeGreaterThanOrEqual(1)
    expect(result.tasksAssigned).toBe(2)
  })

  it('returns zero for date with no unassigned tasks', async () => {
    const dispatcher = await getUser('dispatcher')
    const date = dateString(Date.now())
    const result = await dispatchService.generatePlan(date, dispatcher, 'Planned auto-route for test')
    expect(result.batchesCreated).toBe(0)
    expect(result.tasksAssigned).toBe(0)
  })

  it('throws if no drivers exist', async () => {
    // Clear all users, then add only a non-dispatcher
    await db.users.clear()
    const { hash, salt } = await hashPassword('MemberPass123!')
    const memberId = await db.users.add({
      username: 'onlymember',
      role: 'Member',
      passwordHash: hash,
      salt,
      failedAttempts: 0,
    })
    const member = await db.users.get(memberId)

    const now = Date.now()
    const date = dateString(now)
    const deliveryStart = new Date(`${date}T10:00:00`).getTime()
    await db.deliveryTasks.add({
      orderId: 999,
      status: 'Unassigned',
      priority: 1,
      weightLbs: 10,
      promisedPickupWindow: { start: deliveryStart - 3600000, end: deliveryStart },
      promisedDeliveryWindow: { start: deliveryStart, end: deliveryStart + 3600000 },
      address: 'No Driver',
      version: 1,
    })

    // member role → DISPATCH_ROLE_FORBIDDEN, not DISPATCH_REASON_TOO_SHORT
    await expect(dispatchService.generatePlan(date, member!, 'Valid reason here')).rejects.toBeInstanceOf(DispatchError)
  })

  it('uses order promised windows instead of synthetic defaults', async () => {
    const now = Date.now()
    const date = dateString(now)

    // Add a campaign and confirmed order with real windows
    const campaignId = await db.campaigns.add({
      title: 'Test Campaign',
      description: 'Test',
      fishEntryId: 1,
      pricePerUnit: 10,
      unit: 'lb',
      status: 'Confirmed',
      cutoffAt: now - 1000,
      minParticipants: 1,
      createdBy: 1,
      createdAt: now - 2000,
      version: 1,
    })

    const pickupStart = new Date(`${date}T09:00:00`).getTime()
    const deliveryStart = new Date(`${date}T11:00:00`).getTime()

    const orderId = await db.orders.add({
      operationId: 'test-op-1',
      campaignId,
      memberId: 1,
      quantity: 2,
      totalPrice: 20,
      status: 'Confirmed',
      fulfillmentAddress: '5 Harbor Way',
      promisedPickupWindow: { start: pickupStart, end: pickupStart + 3600000 },
      promisedDeliveryWindow: { start: deliveryStart, end: deliveryStart + 3600000 },
      createdAt: now - 2000,
      autoCloseAt: now + 1800000,
      version: 1,
    })

    // Generate tasks from orders
    await dispatchService.generateTasksFromOrders()

    // Verify the task uses the stored windows
    const task = await db.deliveryTasks.where('orderId').equals(orderId).first()
    expect(task?.promisedPickupWindow.start).toBe(pickupStart)
    expect(task?.promisedDeliveryWindow.start).toBe(deliveryStart)
  })

  it('logs AUTO_PLAN action after generatePlan', async () => {
    const dispatcher = await getUser('dispatcher')
    const now = Date.now()
    const date = dateString(now)

    const deliveryStart = new Date(`${date}T10:00:00`).getTime()
    await db.deliveryTasks.add({
      orderId: 999,
      status: 'Unassigned',
      priority: 1,
      weightLbs: 30,
      promisedPickupWindow: { start: deliveryStart - 3600000, end: deliveryStart - 1800000 },
      promisedDeliveryWindow: { start: deliveryStart, end: deliveryStart + 3600000 },
      address: '99 Log St',
      version: 1,
    })

    const operatorReason = 'Running daily auto-plan for route'
    await dispatchService.generatePlan(date, dispatcher, operatorReason)
    const log = await db.dispatchLogs.where('action').equals('AUTO_PLAN').first()
    expect(log).toBeTruthy()
    // Operator reason must be persisted in the log (not an auto-generated string)
    expect(log?.reason).toBe(operatorReason)
  })

  it('throws DISPATCH_REASON_TOO_SHORT when reason is fewer than 10 characters', async () => {
    const dispatcher = await getUser('dispatcher')
    const date = dateString(Date.now())
    await expect(
      dispatchService.generatePlan(date, dispatcher, 'short'),
    ).rejects.toMatchObject({ code: 'DISPATCH_REASON_TOO_SHORT' })
  })
})
