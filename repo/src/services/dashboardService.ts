import { db } from '../db/db.ts'

export const dashboardService = {
  async getCounts(): Promise<{
    openCampaigns: number
    confirmedOrders: number
    unassignedTasks: number
    pendingNotifications: number
    publishedFish: number
    openCourses: number
  }> {
    const [openCampaigns, confirmedOrders, unassignedTasks, pendingNotifications, publishedFish, openCourses] =
      await Promise.all([
        db.campaigns.where('status').equals('Open').count(),
        db.orders.where('status').equals('Confirmed').count(),
        db.deliveryTasks.where('status').equals('Unassigned').count(),
        db.notifications.where('status').equals('Pending').count(),
        db.fishEntries.where('status').equals('published').count(),
        db.courses.where('status').equals('Open').count(),
      ])

    return { openCampaigns, confirmedOrders, unassignedTasks, pendingNotifications, publishedFish, openCourses }
  },
}
