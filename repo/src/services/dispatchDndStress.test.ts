// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedTestUsers } from '../db/seed.ts'
import { dispatchService } from './dispatchService.ts'
import type { User } from '../types/index.ts'

async function getUser(username: string): Promise<User> {
  const user = await db.users.where('username').equals(username).first()
  if (!user) throw new Error(`Missing user: ${username}`)
  return user
}

function dateString(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  await seedTestUsers()
})

describe('dispatch DnD conflict stress — repeated assign/unassign/recalculate', () => {
  async function setupBatchAndTasks(dispatcher: User) {
    const date = dateString(Date.now())
    const batchId = await db.deliveryBatches.add({
      label: 'Stress Batch',
      vehicleId: 'van-stress',
      driverId: dispatcher.id!,
      date,
      shiftStart: 8 * 60,
      shiftEnd: 18 * 60,
      vehicleCapacityLbs: 200,
      status: 'Planned',
      version: 1,
    })

    const delivery = new Date(`${date}T10:00:00`).getTime()
    const taskIds: number[] = []
    for (let i = 0; i < 5; i++) {
      const id = await db.deliveryTasks.add({
        orderId: 500 + i,
        status: 'Unassigned',
        priority: 1,
        weightLbs: 30,
        promisedPickupWindow: { start: delivery - 3600000, end: delivery },
        promisedDeliveryWindow: { start: delivery, end: delivery + 3600000 },
        address: `${i + 1} Stress Dock`,
        version: 1,
      })
      taskIds.push(id)
    }

    return { date, batchId, taskIds }
  }

  it('assign then unassign then reassign the same task stays consistent', async () => {
    const dispatcher = await getUser('dispatcher')
    const { batchId, taskIds } = await setupBatchAndTasks(dispatcher)
    const taskId = taskIds[0]

    // Assign
    await dispatchService.assignTask(taskId, batchId, 'Initial assignment for stress test', dispatcher)
    let task = await db.deliveryTasks.get(taskId)
    expect(task?.batchId).toBe(batchId)
    expect(task?.status).toBe('Assigned')

    // Unassign
    await dispatchService.unassignTask(taskId, 'Removing from batch for reallocation', dispatcher)
    task = await db.deliveryTasks.get(taskId)
    expect(task?.batchId).toBeUndefined()
    expect(task?.status).toBe('Unassigned')

    // Reassign
    const freshTask = await db.deliveryTasks.get(taskId)
    await dispatchService.assignTask(taskId, batchId, 'Re-assigning after unassign cycle', dispatcher, {
      expectedTaskVersion: freshTask!.version,
    })
    task = await db.deliveryTasks.get(taskId)
    expect(task?.batchId).toBe(batchId)
    expect(task?.status).toBe('Assigned')
  })

  it('multiple sequential assigns up to capacity then overflow conflict', async () => {
    const dispatcher = await getUser('dispatcher')
    const { batchId, taskIds } = await setupBatchAndTasks(dispatcher)

    // Batch is 200 lbs, tasks are 30 each. Assign 6 tasks: 6*30 = 180 OK, 7th would be 210
    // We have 5 tasks. Assign all 5 (150 lbs total — fits)
    for (const taskId of taskIds) {
      await dispatchService.assignTask(taskId, batchId, 'Filling batch to near capacity', dispatcher)
    }

    // Add a heavy task that overflows
    const date = dateString(Date.now())
    const delivery = new Date(`${date}T10:00:00`).getTime()
    const overflowTaskId = await db.deliveryTasks.add({
      orderId: 999,
      status: 'Unassigned',
      priority: 1,
      weightLbs: 100,
      promisedPickupWindow: { start: delivery - 3600000, end: delivery },
      promisedDeliveryWindow: { start: delivery, end: delivery + 3600000 },
      address: 'Overflow Dock',
      version: 1,
    })

    await expect(
      dispatchService.assignTask(overflowTaskId, batchId, 'This should overflow capacity', dispatcher),
    ).rejects.toMatchObject({ code: 'DISPATCH_CAPACITY_EXCEEDED' })

    const overflowTask = await db.deliveryTasks.get(overflowTaskId)
    expect(overflowTask?.status).toBe('Unassigned')
  })

  it('recalculate after multiple mutations preserves log integrity', async () => {
    const dispatcher = await getUser('dispatcher')
    const { date, batchId, taskIds } = await setupBatchAndTasks(dispatcher)

    // Assign two tasks
    await dispatchService.assignTask(taskIds[0], batchId, 'Assign first for recalculate test', dispatcher)
    await dispatchService.assignTask(taskIds[1], batchId, 'Assign second for recalculate test', dispatcher)

    // Unassign one
    await dispatchService.unassignTask(taskIds[0], 'Removing before recalculate', dispatcher)

    // Recalculate
    await dispatchService.recalculate(date, dispatcher, 'Rebalance after manual edits in stress test')

    const logs = await db.dispatchLogs.orderBy('timestamp').toArray()
    const actions = logs.map((l) => l.action)
    expect(actions).toContain('MANUAL_ASSIGN')
    expect(actions).toContain('MANUAL_UNASSIGN')
    expect(actions).toContain('RECALCULATE')
  })

  it('conflict detection reflects current state after churn', async () => {
    const dispatcher = await getUser('dispatcher')
    const date = dateString(Date.now())
    const batchId = await db.deliveryBatches.add({
      label: 'Churn Batch',
      vehicleId: 'van-churn',
      driverId: dispatcher.id!,
      date,
      shiftStart: 8 * 60,
      shiftEnd: 18 * 60,
      vehicleCapacityLbs: 100,
      status: 'Planned',
      version: 1,
    })

    const delivery = new Date(`${date}T10:00:00`).getTime()
    const t1 = await db.deliveryTasks.add({
      orderId: 601,
      batchId,
      status: 'Assigned',
      priority: 1,
      weightLbs: 60,
      promisedPickupWindow: { start: delivery - 3600000, end: delivery },
      promisedDeliveryWindow: { start: delivery, end: delivery + 3600000 },
      address: 'A',
      version: 1,
    })
    await db.deliveryTasks.add({
      orderId: 602,
      batchId,
      status: 'Assigned',
      priority: 1,
      weightLbs: 60,
      promisedPickupWindow: { start: delivery - 3600000, end: delivery },
      promisedDeliveryWindow: { start: delivery, end: delivery + 3600000 },
      address: 'B',
      version: 1,
    })

    // Capacity is 100, load is 120 — should detect CAPACITY_EXCEEDED
    let conflicts = await dispatchService.detectConflicts(batchId)
    expect(conflicts.some((c) => c.type === 'CAPACITY_EXCEEDED')).toBe(true)

    // Unassign one task, now load is 60 — should resolve
    await dispatchService.unassignTask(t1, 'Freeing capacity for test', dispatcher)
    conflicts = await dispatchService.detectConflicts(batchId)
    expect(conflicts.some((c) => c.type === 'CAPACITY_EXCEEDED')).toBe(false)
  })
})
