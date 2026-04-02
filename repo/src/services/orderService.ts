import { db } from '../db/db.ts'
import { notificationService } from './notificationService.ts'
import type { Order, User } from '../types/index.ts'

export type OrderStatus = Order['status']

interface TransitionPaymentData {
  expectedVersion?: number
  paymentMethod?: Order['paymentMethod']
  paymentNote?: string
}

export class OrderError extends Error {
  code:
    | 'ORDER_CAMPAIGN_CLOSED'
    | 'ORDER_ALREADY_EXISTS'
    | 'ORDER_INVALID_TRANSITION'
    | 'ORDER_VERSION_CONFLICT'
    | 'ORDER_NOT_FOUND'
    | 'ORDER_INVALID_QUANTITY'

  constructor(code: OrderError['code'], message: string) {
    super(message)
    this.code = code
  }
}

function roundUsd(value: number): number {
  return Number(value.toFixed(2))
}

function canTransition(current: OrderStatus, next: OrderStatus): boolean {
  const key = `${current}->${next}`
  const allowed = new Set([
    'Created->Confirmed',
    'Created->Cancelled',
    'Confirmed->Fulfilled',
    'Confirmed->Cancelled',
    'Confirmed->Refunded',
    'Fulfilled->Refunded',
  ])
  return allowed.has(key)
}

async function addAudit(actor: string, action: string, orderId: number) {
  await db.auditLogs.add({
    actor,
    action,
    entityType: 'Order',
    entityId: String(orderId),
    timestamp: Date.now(),
  })
}

export const orderService = {
  async joinCampaign(
    campaignId: number,
    memberId: number,
    quantity: number,
    operationId: string,
    expectedCampaignVersion: number,
    options?: {
      fulfillmentAddress?: string
      promisedPickupWindow?: { start: number; end: number }
      promisedDeliveryWindow?: { start: number; end: number }
    },
  ): Promise<Order> {
    const existing = await db.orders.where('operationId').equals(operationId).first()
    if (existing) {
      return existing
    }

    if (quantity < 1 || !Number.isFinite(quantity)) {
      throw new OrderError('ORDER_INVALID_QUANTITY', 'Quantity must be at least 1.')
    }

    return db.transaction('rw', db.campaigns, db.orders, db.auditLogs, async () => {
      const campaign = await db.campaigns.get(campaignId)
      if (!campaign || campaign.status !== 'Open' || campaign.cutoffAt <= Date.now()) {
        throw new OrderError('ORDER_CAMPAIGN_CLOSED', 'Campaign is closed.')
      }

      if (campaign.version !== expectedCampaignVersion) {
        throw new OrderError('ORDER_VERSION_CONFLICT', 'Campaign version conflict.')
      }

      const duplicateOrder = await db.orders
        .where('[campaignId+memberId]')
        .equals([campaignId, memberId])
        .filter((order) => order.status !== 'Cancelled')
        .first()

      if (duplicateOrder) {
        throw new OrderError('ORDER_ALREADY_EXISTS', 'Member already joined this campaign.')
      }

      const now = Date.now()
      const order: Order = {
        operationId,
        campaignId,
        memberId,
        quantity,
        totalPrice: roundUsd(campaign.pricePerUnit * quantity),
        status: 'Created',
        fulfillmentAddress: options?.fulfillmentAddress,
        promisedPickupWindow: options?.promisedPickupWindow,
        promisedDeliveryWindow: options?.promisedDeliveryWindow,
        createdAt: now,
        autoCloseAt: now + 30 * 60 * 1000,
        version: 1,
      }

      const id = await db.orders.add(order)
      await addAudit(`user:${memberId}`, 'ORDER_CREATED', id)
      return { ...order, id }
    })
  },

  async transitionStatus(
    orderId: number,
    newStatus: OrderStatus,
    actor: User,
    paymentData?: TransitionPaymentData,
  ): Promise<Order> {
    return db.transaction('rw', db.orders, db.auditLogs, async () => {
      const order = await db.orders.get(orderId)
      if (!order) {
        throw new OrderError('ORDER_NOT_FOUND', 'Order not found.')
      }

      if (
        paymentData?.expectedVersion !== undefined &&
        paymentData.expectedVersion !== order.version
      ) {
        throw new OrderError('ORDER_VERSION_CONFLICT', 'Order version conflict.')
      }

      if (!canTransition(order.status, newStatus)) {
        throw new OrderError('ORDER_INVALID_TRANSITION', 'Invalid order transition.')
      }

      const isAdmin = actor.role === 'Administrator'
      const isOwner = actor.role === 'Member' && actor.id === order.memberId

      if (order.status === 'Created' && newStatus === 'Cancelled' && !isAdmin && !isOwner) {
        throw new OrderError(
          'ORDER_INVALID_TRANSITION',
          'Only owner or admin can cancel created order.',
        )
      }

      if (order.status === 'Created' && newStatus === 'Confirmed' && !isAdmin) {
        throw new OrderError('ORDER_INVALID_TRANSITION', 'Only admin can confirm created order.')
      }

      if (['Fulfilled', 'Refunded'].includes(newStatus) && !isAdmin) {
        throw new OrderError('ORDER_INVALID_TRANSITION', 'Only admin can set this status.')
      }

      if (order.status === 'Confirmed' && newStatus === 'Cancelled' && !isAdmin) {
        throw new OrderError(
          'ORDER_INVALID_TRANSITION',
          'Only admin can cancel confirmed order.',
        )
      }

      if (newStatus === 'Confirmed' && !paymentData?.paymentMethod) {
        throw new OrderError(
          'ORDER_INVALID_TRANSITION',
          'Payment method required for confirmation.',
        )
      }

      const updated: Order = {
        ...order,
        status: newStatus,
        version: order.version + 1,
        paymentMethod:
          newStatus === 'Confirmed' ? paymentData?.paymentMethod : order.paymentMethod,
        paymentNote: paymentData?.paymentNote ?? order.paymentNote,
        paymentRecordedAt:
          newStatus === 'Confirmed' ? Date.now() : order.paymentRecordedAt,
      }

      await db.orders.put(updated)
      await addAudit(actor.username, `ORDER_${newStatus.toUpperCase()}`, orderId)
      return updated
    }).then(async (updatedOrder) => {
      if (updatedOrder.status === 'Confirmed') {
        const pickupDue = updatedOrder.promisedPickupWindow
          ? new Date(updatedOrder.promisedPickupWindow.start).toLocaleString()
          : new Date(updatedOrder.paymentRecordedAt ?? Date.now()).toLocaleDateString()
        await notificationService.send(updatedOrder.memberId, 'PICKUP_DUE', {
          orderId: String(orderId),
          dueTime: pickupDue,
        })
      }
      return updatedOrder
    })
  },

  async autoCloseUnpaid(): Promise<void> {
    const staleOrders = await db.orders
      .where('status')
      .equals('Created')
      .and((order) => order.autoCloseAt <= Date.now())
      .toArray()

    for (const order of staleOrders) {
      if (!order.id) {
        continue
      }

      const closed = await db.transaction('rw', db.orders, db.auditLogs, async () => {
        const current = await db.orders.get(order.id!)
        if (
          !current ||
          current.status !== 'Created' ||
          current.autoCloseAt > Date.now() ||
          current.version !== order.version
        ) {
          return false
        }

        await db.orders.put({
          ...current,
          status: 'Cancelled',
          version: current.version + 1,
        })
        await addAudit('scheduler', 'ORDER_AUTO_CLOSED', current.id!)
        return true
      })

      if (closed) {
        await notificationService.send(order.memberId, 'ORDER_OVERDUE', {
          orderId: String(order.id),
        })
        await notificationService.send(order.memberId, 'ORDER_AUTO_CLOSED', {
          orderId: String(order.id),
        })
      }
    }
  },
}

export type { TransitionPaymentData }
