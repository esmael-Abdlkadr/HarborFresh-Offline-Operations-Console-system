import { db } from '../db/db.ts'
import type { DeliveryBatch, DeliveryTask, User } from '../types/index.ts'

export interface ConflictResult {
  type: 'CAPACITY_EXCEEDED' | 'TIME_WINDOW_VIOLATION' | 'PICKUP_WINDOW_VIOLATION' | 'DUPLICATE_ADDRESS'
  message: string
}

export class DispatchError extends Error {
  code:
    | 'DISPATCH_REASON_TOO_SHORT'
    | 'DISPATCH_CAPACITY_EXCEEDED'
    | 'DISPATCH_TIME_CONFLICT'
    | 'DISPATCH_NOT_FOUND'
    | 'DISPATCH_VERSION_CONFLICT'
    | 'DISPATCH_ROLE_FORBIDDEN'

  meta?: Record<string, unknown>

  constructor(code: DispatchError['code'], message: string, meta?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.meta = meta
  }
}

function parseDateRange(date: string): { start: number; end: number } {
  const [year, month, day] = date.split('-').map(Number)
  const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
  const end = new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
  return { start, end }
}

function minuteOfDay(ms: number): number {
  const d = new Date(ms)
  return d.getHours() * 60 + d.getMinutes()
}

function deliveryFitsShift(task: DeliveryTask, batch: DeliveryBatch): boolean {
  const m = minuteOfDay(task.promisedDeliveryWindow.start)
  return m >= batch.shiftStart && m <= batch.shiftEnd
}

function pickupFitsShift(task: DeliveryTask, batch: DeliveryBatch): boolean {
  const m = minuteOfDay(task.promisedPickupWindow.start)
  return m >= batch.shiftStart && m <= batch.shiftEnd
}

function windowFitsShift(task: DeliveryTask, batch: DeliveryBatch): boolean {
  return deliveryFitsShift(task, batch) && pickupFitsShift(task, batch)
}

async function currentLoad(batchId: number): Promise<number> {
  const tasks = await db.deliveryTasks.where('batchId').equals(batchId).toArray()
  return tasks.reduce((sum, task) => sum + task.weightLbs, 0)
}

async function writeLog(input: {
  batchId?: number
  taskId?: number
  actorId: number
  action: 'AUTO_PLAN' | 'MANUAL_ASSIGN' | 'MANUAL_UNASSIGN' | 'BATCH_CREATED' | 'RECALCULATE'
  reason: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}) {
  await db.dispatchLogs.add({
    ...input,
    timestamp: Date.now(),
  })
}

function assertVersion(current: number, expected?: number) {
  if (expected !== undefined && current !== expected) {
    throw new DispatchError('DISPATCH_VERSION_CONFLICT', 'Record version conflict.')
  }
}

function assertDispatchRole(actor: User) {
  if (actor.role !== 'Dispatcher' && actor.role !== 'Administrator') {
    throw new DispatchError('DISPATCH_ROLE_FORBIDDEN', 'Only Dispatcher or Administrator can perform this action.')
  }
}

export const dispatchService = {
  async generateTasksFromOrders(): Promise<number> {
    const confirmedOrders = await db.orders.where('status').equals('Confirmed').toArray()
    let created = 0

    for (const order of confirmedOrders) {
      if (!order.id) continue

      // Skip if a delivery task already exists for this order
      const existing = await db.deliveryTasks.where('orderId').equals(order.id).first()
      if (existing) continue

      const campaign = await db.campaigns.get(order.campaignId)
      if (!campaign) continue

      const now = Date.now()
      const task: DeliveryTask = {
        orderId: order.id,
        status: 'Unassigned',
        priority: 2,
        weightLbs: Math.max(1, order.quantity * 5),
        promisedPickupWindow: order.promisedPickupWindow ?? {
          start: now + 30 * 60 * 1000,
          end: now + 90 * 60 * 1000,
        },
        promisedDeliveryWindow: order.promisedDeliveryWindow ?? {
          start: now + 120 * 60 * 1000,
          end: now + 240 * 60 * 1000,
        },
        address: order.fulfillmentAddress ?? `Member ${order.memberId} delivery`,
        version: 1,
      }

      await db.deliveryTasks.add(task)
      created++
    }

    return created
  },

  async addBatch(data: Omit<DeliveryBatch, 'id' | 'version'>, actor: User, reason: string): Promise<DeliveryBatch> {
    assertDispatchRole(actor)
    if (reason.trim().length < 10) {
      throw new DispatchError('DISPATCH_REASON_TOO_SHORT', 'Reason must be at least 10 characters.')
    }
    if (!actor.id) {
      throw new DispatchError('DISPATCH_NOT_FOUND', 'Actor missing.')
    }
    const actorId = actor.id

    const batch: DeliveryBatch = {
      ...data,
      version: 1,
    }
    const id = await db.deliveryBatches.add(batch)
    await writeLog({
      batchId: id,
      actorId,
      action: 'BATCH_CREATED',
      reason,
      after: batch as unknown as Record<string, unknown>,
    })
    return { ...batch, id }
  },

  async autoPlan(date: string, actor: User): Promise<void> {
    assertDispatchRole(actor)
    if (!actor.id) {
      throw new DispatchError('DISPATCH_NOT_FOUND', 'Actor missing.')
    }
    const actorId = actor.id

    const range = parseDateRange(date)
    const tasks = (await db.deliveryTasks.where('status').equals('Unassigned').toArray())
      .filter(
        (task) =>
          task.promisedDeliveryWindow.start >= range.start && task.promisedDeliveryWindow.start <= range.end,
      )
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority
        return a.promisedDeliveryWindow.start - b.promisedDeliveryWindow.start
      })

    const batches = (await db.deliveryBatches.where('date').equals(date).toArray())
      .filter((batch) => batch.status === 'Planned')
      .sort((a, b) => a.id! - b.id!)

    await db.transaction('rw', db.deliveryTasks, db.deliveryBatches, db.dispatchLogs, async () => {
      for (const task of tasks) {
        if (!task.id) continue
        const currentTask = await db.deliveryTasks.get(task.id)
        if (!currentTask || currentTask.status !== 'Unassigned') continue
        let assigned = false
        for (const batch of batches) {
          if (!batch.id) continue
          const currentBatch = await db.deliveryBatches.get(batch.id)
          if (!currentBatch || currentBatch.status !== 'Planned') continue
          const load = await currentLoad(batch.id)
          if (load + currentTask.weightLbs > currentBatch.vehicleCapacityLbs) continue
          if (!windowFitsShift(currentTask, currentBatch)) continue

          await db.deliveryTasks.put({
            ...currentTask,
            batchId: currentBatch.id,
            status: 'Assigned',
            version: currentTask.version + 1,
          })
          assigned = true
          break
        }
        if (!assigned) {
          continue
        }
      }

      await writeLog({
        actorId,
        action: 'AUTO_PLAN',
        reason: `Automatic plan generated for ${date}`,
      })
    })
  },

  async assignTask(
    taskId: number,
    batchId: number,
    reason: string,
    actor: User,
    options?: { expectedTaskVersion?: number; expectedBatchVersion?: number },
  ): Promise<void> {
    assertDispatchRole(actor)
    if (reason.trim().length < 10) {
      throw new DispatchError('DISPATCH_REASON_TOO_SHORT', 'Reason must be at least 10 characters.')
    }
    if (!actor.id) {
      throw new DispatchError('DISPATCH_NOT_FOUND', 'Actor missing.')
    }
    const actorId = actor.id

    await db.transaction('rw', db.deliveryTasks, db.deliveryBatches, db.dispatchLogs, async () => {
      const task = await db.deliveryTasks.get(taskId)
      const batch = await db.deliveryBatches.get(batchId)
      if (!task || !batch) {
        throw new DispatchError('DISPATCH_NOT_FOUND', 'Task or batch not found.')
      }
      assertVersion(task.version, options?.expectedTaskVersion)
      assertVersion(batch.version, options?.expectedBatchVersion)

      const load = await currentLoad(batchId)
      if (load + task.weightLbs > batch.vehicleCapacityLbs) {
        throw new DispatchError('DISPATCH_CAPACITY_EXCEEDED', 'Capacity exceeded.', {
          overBy: load + task.weightLbs - batch.vehicleCapacityLbs,
        })
      }

      if (!windowFitsShift(task, batch)) {
        throw new DispatchError(
          'DISPATCH_TIME_CONFLICT',
          'Task delivery window conflicts with batch shift.',
        )
      }

      await db.deliveryTasks.put({
        ...task,
        batchId,
        status: 'Assigned',
        version: task.version + 1,
      })

      await writeLog({
        batchId,
        taskId,
        actorId,
        action: 'MANUAL_ASSIGN',
        reason,
        before: { batchId: task.batchId, status: task.status },
        after: { batchId, status: 'Assigned' },
      })
    })
  },

  async unassignTask(
    taskId: number,
    reason: string,
    actor: User,
    options?: { expectedTaskVersion?: number },
  ): Promise<void> {
    assertDispatchRole(actor)
    if (reason.trim().length < 10) {
      throw new DispatchError('DISPATCH_REASON_TOO_SHORT', 'Reason must be at least 10 characters.')
    }
    if (!actor.id) {
      throw new DispatchError('DISPATCH_NOT_FOUND', 'Actor missing.')
    }
    const actorId = actor.id

    await db.transaction('rw', db.deliveryTasks, db.dispatchLogs, async () => {
      const task = await db.deliveryTasks.get(taskId)
      if (!task) {
        throw new DispatchError('DISPATCH_NOT_FOUND', 'Task not found.')
      }
      assertVersion(task.version, options?.expectedTaskVersion)

      await db.deliveryTasks.put({
        ...task,
        batchId: undefined,
        status: 'Unassigned',
        version: task.version + 1,
      })

      await writeLog({
        batchId: task.batchId,
        taskId,
        actorId,
        action: 'MANUAL_UNASSIGN',
        reason,
        before: { batchId: task.batchId, status: task.status },
        after: { batchId: null, status: 'Unassigned' },
      })
    })
  },

  async recalculate(
    date: string,
    actor: User,
    reason: string,
    options?: { expectedTaskVersions?: Record<number, number> },
  ): Promise<void> {
    assertDispatchRole(actor)
    if (reason.trim().length < 10) {
      throw new DispatchError('DISPATCH_REASON_TOO_SHORT', 'Reason must be at least 10 characters.')
    }
    if (!actor.id) {
      throw new DispatchError('DISPATCH_NOT_FOUND', 'Actor missing.')
    }
    const actorId = actor.id

    const range = parseDateRange(date)
    await db.transaction('rw', db.deliveryTasks, async () => {
      const tasks = await db.deliveryTasks.toArray()
      const forDate = tasks.filter(
        (task) =>
          task.promisedDeliveryWindow.start >= range.start &&
          task.promisedDeliveryWindow.start <= range.end,
      )

      for (const task of forDate) {
        if (!task.id) continue
        assertVersion(task.version, options?.expectedTaskVersions?.[task.id])
        await db.deliveryTasks.put({
          ...task,
          batchId: undefined,
          status: 'Unassigned',
          version: task.version + 1,
        })
      }
    })

    await this.autoPlan(date, actor)
    await writeLog({
      actorId,
      action: 'RECALCULATE',
      reason,
    })
  },

  async generatePlan(date: string, actor: User, reason: string): Promise<{ batchesCreated: number; tasksAssigned: number }> {
    assertDispatchRole(actor)
    if (reason.trim().length < 10) {
      throw new DispatchError('DISPATCH_REASON_TOO_SHORT', 'Reason must be at least 10 characters.')
    }
    if (!actor.id) throw new DispatchError('DISPATCH_NOT_FOUND', 'Actor missing.')
    const actorId = actor.id

    // First generate tasks from confirmed orders
    await dispatchService.generateTasksFromOrders()

    // Get unassigned tasks for this date
    const range = parseDateRange(date)
    const unassignedTasks = (await db.deliveryTasks.where('status').equals('Unassigned').toArray())
      .filter((task) => task.promisedDeliveryWindow.start >= range.start && task.promisedDeliveryWindow.start <= range.end)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority
        return a.promisedDeliveryWindow.start - b.promisedDeliveryWindow.start
      })

    if (unassignedTasks.length === 0) return { batchesCreated: 0, tasksAssigned: 0 }

    // Get existing planned batches
    const existingBatches = (await db.deliveryBatches.where('date').equals(date).toArray()).filter((b) => b.status === 'Planned')

    // Get available drivers (Dispatcher or Administrator)
    const drivers = await db.users.filter((u) => u.role === 'Dispatcher' || u.role === 'Administrator').toArray()
    if (drivers.length === 0) throw new DispatchError('DISPATCH_NOT_FOUND', 'No drivers available for planning.')

    const DEFAULT_CAPACITY = 400
    const DEFAULT_SHIFT_START = 8 * 60
    const DEFAULT_SHIFT_END = 17 * 60

    let batchesCreated = 0
    let tasksAssigned = 0

    await db.transaction('rw', db.deliveryTasks, db.deliveryBatches, db.dispatchLogs, async () => {
      const workingBatches = [...existingBatches]

      for (const task of unassignedTasks) {
        if (!task.id) continue
        const currentTask = await db.deliveryTasks.get(task.id)
        if (!currentTask || currentTask.status !== 'Unassigned') continue

        let assigned = false

        // Try to fit into an existing batch
        for (const batch of workingBatches) {
          if (!batch.id) continue
          const currentBatch = await db.deliveryBatches.get(batch.id)
          if (!currentBatch || currentBatch.status !== 'Planned') continue
          const load = await currentLoad(batch.id)
          if (load + currentTask.weightLbs > currentBatch.vehicleCapacityLbs) continue
          if (!windowFitsShift(currentTask, currentBatch)) continue

          await db.deliveryTasks.put({ ...currentTask, batchId: currentBatch.id, status: 'Assigned', version: currentTask.version + 1 })
          tasksAssigned++
          assigned = true
          break
        }

        if (!assigned) {
          // Create a new batch
          const driverIndex = batchesCreated % drivers.length
          const driver = drivers[driverIndex]
          const batchLabel = `Auto-${date}-${batchesCreated + 1}`
          const newBatchData = {
            label: batchLabel,
            vehicleId: `van-auto-${batchesCreated + 1}`,
            driverId: driver.id!,
            date,
            shiftStart: DEFAULT_SHIFT_START,
            shiftEnd: DEFAULT_SHIFT_END,
            vehicleCapacityLbs: DEFAULT_CAPACITY,
            status: 'Planned' as const,
            version: 1,
          }
          const newBatchId = await db.deliveryBatches.add(newBatchData)
          await writeLog({
            batchId: newBatchId,
            actorId,
            action: 'BATCH_CREATED',
            reason: `Auto-generated batch for ${date}`,
            after: newBatchData as unknown as Record<string, unknown>,
          })
          batchesCreated++
          const createdBatch = { ...newBatchData, id: newBatchId }
          workingBatches.push(createdBatch)

          // Check if task fits in this new batch
          if (!windowFitsShift(currentTask, createdBatch)) continue
          await db.deliveryTasks.put({ ...currentTask, batchId: newBatchId, status: 'Assigned', version: currentTask.version + 1 })
          tasksAssigned++
        }
      }

      await writeLog({
        actorId,
        action: 'AUTO_PLAN',
        reason,
      })
    })

    return { batchesCreated, tasksAssigned }
  },

  async detectConflicts(batchId: number): Promise<ConflictResult[]> {
    const batch = await db.deliveryBatches.get(batchId)
    if (!batch) {
      return []
    }
    const tasks = await db.deliveryTasks.where('batchId').equals(batchId).toArray()
    const conflicts: ConflictResult[] = []

    const total = tasks.reduce((sum, task) => sum + task.weightLbs, 0)
    if (total > batch.vehicleCapacityLbs) {
      conflicts.push({
        type: 'CAPACITY_EXCEEDED',
        message: `Capacity exceeded by ${(total - batch.vehicleCapacityLbs).toFixed(2)} lbs.`,
      })
    }

    const badDelivery = tasks.find((task) => !deliveryFitsShift(task, batch))
    if (badDelivery) {
      conflicts.push({
        type: 'TIME_WINDOW_VIOLATION',
        message: `Task ${badDelivery.id} has delivery window outside shift.`,
      })
    }

    const badPickup = tasks.find((task) => !pickupFitsShift(task, batch))
    if (badPickup) {
      conflicts.push({
        type: 'PICKUP_WINDOW_VIOLATION',
        message: `Task ${badPickup.id} has pickup window outside shift.`,
      })
    }

    const addressMap = new Map<string, number>()
    for (const task of tasks) {
      const normalized = task.address.trim().toLowerCase()
      addressMap.set(normalized, (addressMap.get(normalized) ?? 0) + 1)
    }
    const duplicate = Array.from(addressMap.entries()).find(([, count]) => count > 1)
    if (duplicate) {
      conflicts.push({
        type: 'DUPLICATE_ADDRESS',
        message: `Duplicate address detected: ${duplicate[0]}`,
      })
    }

    return conflicts
  },
}
