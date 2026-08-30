import { supabase } from './supabase';
import type { SubscriptionTier } from '../types/database';

export const FREE_TIER_MONTHLY_SCANS = 10;

export interface DashboardStats {
  scansThisMonth: number;
  subscriptionTier: SubscriptionTier;
  unlistedCount: number;
  listedCount: number;
  soldCount: number;
  shippedCount: number;
  totalSpent: number;
  totalRevenue: number;
  totalProfit: number;
  ordersAwaitingShipment: number;
}

/** Aggregates the user's scan usage, inventory pipeline, and profit for the dashboard. */
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const [profileResult, inventoryResult, ordersResult] = await Promise.all([
    supabase.from('profiles').select('scans_this_month, subscription_tier').eq('id', userId).single(),
    supabase.from('inventory').select('status, purchase_price, sold_price').eq('user_id', userId),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'awaiting_shipment'),
  ]);

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }
  if (inventoryResult.error) {
    throw new Error(inventoryResult.error.message);
  }
  if (ordersResult.error) {
    throw new Error(ordersResult.error.message);
  }

  const inventory = inventoryResult.data ?? [];

  let unlistedCount = 0;
  let listedCount = 0;
  let soldCount = 0;
  let shippedCount = 0;
  let totalSpent = 0;
  let totalRevenue = 0;
  let soldPurchaseCost = 0;

  for (const row of inventory) {
    totalSpent += row.purchase_price ?? 0;

    switch (row.status) {
      case 'unlisted':
        unlistedCount += 1;
        break;
      case 'listed':
        listedCount += 1;
        break;
      case 'sold':
        soldCount += 1;
        break;
      case 'shipped':
        shippedCount += 1;
        break;
    }

    if (row.sold_price != null) {
      totalRevenue += row.sold_price;
      soldPurchaseCost += row.purchase_price ?? 0;
    }
  }

  return {
    scansThisMonth: profileResult.data.scans_this_month,
    subscriptionTier: profileResult.data.subscription_tier,
    unlistedCount,
    listedCount,
    soldCount,
    shippedCount,
    totalSpent,
    totalRevenue,
    totalProfit: totalRevenue - soldPurchaseCost,
    ordersAwaitingShipment: ordersResult.count ?? 0,
  };
}
