import { db } from '../db/db.ts'
import { notificationService } from './notificationService.ts'
import type { Campaign, User } from '../types/index.ts'

interface CampaignInput {
  title: string
  description: string
  fishEntryId: number
  pricePerUnit: number
  unit: string
  minParticipants: number
  cutoffAt: number
}

function roundUsd(value: number): number {
  return Number(value.toFixed(2))
}

async function addAudit(actor: string, action: string, campaignId: number) {
  await db.auditLogs.add({
    actor,
    action,
    entityType: 'Campaign',
    entityId: String(campaignId),
    timestamp: Date.now(),
  })
}

export const campaignService = {
  async createCampaign(data: CampaignInput, actor: User): Promise<Campaign> {
    if (!(actor.role === 'Administrator' || actor.role === 'Member') || !actor.id) {
      throw new Error('Only administrators or members can create campaigns.')
    }
    if (data.cutoffAt <= Date.now()) {
      throw new Error('Cutoff time must be in the future.')
    }
    if (data.minParticipants < 1) {
      throw new Error('Minimum participants must be at least 1.')
    }

    const fish = await db.fishEntries.get(data.fishEntryId)
    if (!fish || fish.status !== 'published') {
      throw new Error('Campaign fish must reference a published fish entry.')
    }

    const now = Date.now()
    const campaign: Campaign = {
      title: data.title.trim(),
      description: data.description.trim(),
      fishEntryId: data.fishEntryId,
      pricePerUnit: roundUsd(data.pricePerUnit),
      unit: data.unit.trim() || 'lb',
      minParticipants: data.minParticipants,
      cutoffAt: data.cutoffAt,
      status: 'Open',
      createdBy: actor.id,
      createdAt: now,
      version: 1,
    }

    const id = await db.campaigns.add(campaign)
    await addAudit(actor.username, 'CAMPAIGN_CREATED', id)
    return { ...campaign, id }
  },

  async getCampaignWithOrderCount(id: number): Promise<(Campaign & { orderCount: number }) | null> {
    const campaign = await db.campaigns.get(id)
    if (!campaign) {
      return null
    }

    const orderCount = await db.orders
      .where('campaignId')
      .equals(id)
      .filter((order) => order.status !== 'Cancelled')
      .count()

    return {
      ...campaign,
      orderCount,
    }
  },

  async checkAndCloseExpired(): Promise<void> {
    const dueCampaigns = await db.campaigns
      .where('status')
      .equals('Open')
      .and((campaign) => campaign.cutoffAt <= Date.now())
      .toArray()

    for (const campaign of dueCampaigns) {
      if (!campaign.id) {
        continue
      }

      let cancellationRecipients: number[] = []
      let cancellationTitle = campaign.title
      let holdAvailableRecipients: number[] = []
      let holdAvailableTitle = campaign.title

      const cancelled = await db.transaction('rw', db.campaigns, db.orders, db.auditLogs, async () => {
        const currentCampaign = await db.campaigns.get(campaign.id!)
        if (
          !currentCampaign ||
          currentCampaign.status !== 'Open' ||
          currentCampaign.cutoffAt > Date.now() ||
          currentCampaign.version !== campaign.version
        ) {
          return false
        }

        const orders = await db.orders.where('campaignId').equals(campaign.id!).toArray()
        const activeOrders = orders.filter((order) => order.status !== 'Cancelled')

        if (activeOrders.length >= currentCampaign.minParticipants) {
          await db.campaigns.put({
            ...currentCampaign,
            status: 'Confirmed',
            version: currentCampaign.version + 1,
          })
          await addAudit('scheduler', 'CAMPAIGN_CONFIRMED', currentCampaign.id!)
          holdAvailableRecipients = activeOrders.map((order) => order.memberId)
          holdAvailableTitle = currentCampaign.title
          return false
        }

        await db.campaigns.put({
          ...currentCampaign,
          status: 'Cancelled',
          version: currentCampaign.version + 1,
        })

        for (const order of orders) {
          if (!order.id) {
            continue
          }
          if (order.status === 'Created' || order.status === 'Confirmed') {
            await db.orders.put({
              ...order,
              status: 'Cancelled',
              version: order.version + 1,
            })
          }
        }

        cancellationRecipients = orders.map((order) => order.memberId)
        cancellationTitle = currentCampaign.title
        await addAudit('scheduler', 'CAMPAIGN_CANCELLED', currentCampaign.id!)
        return true
      })

      if (cancelled) {
        await Promise.all(
          cancellationRecipients.map((recipientId) =>
            notificationService.send(recipientId, 'CAMPAIGN_CANCELLED', {
              campaignTitle: cancellationTitle,
            }),
          ),
        )
      }

      if (holdAvailableRecipients.length > 0) {
        await Promise.all(
          holdAvailableRecipients.map((recipientId) =>
            notificationService.send(recipientId, 'HOLD_AVAILABLE', {
              itemName: holdAvailableTitle,
            }),
          ),
        )
      }
    }
  },
}
