import { supabase } from './supabase';
import type { Database } from '../types/database';

export type OrderRow = Database['public']['Tables']['orders']['Row'];
export type InventoryRow = Database['public']['Tables']['inventory']['Row'];
export type ScanRow = Database['public']['Tables']['scans']['Row'];
export type OrderWithItem = OrderRow & { inventory: (InventoryRow & { scans: ScanRow | null }) | null };

/** Lists the user's orders, newest first, with the sold inventory item + scan joined in. */
export async function listOrders(userId: string): Promise<OrderWithItem[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, inventory(*, scans(*))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as OrderWithItem[];
}

interface SyncOrdersResponse {
  newOrders: Array<{ inventoryId: string; ebayOrderId: string }>;
}

/** Polls eBay for newly-sold listed items and syncs them into the orders table. */
export async function syncOrders(): Promise<SyncOrdersResponse> {
  const { data, error } = await supabase.functions.invoke<SyncOrdersResponse>('sync-orders', {
    method: 'POST',
  });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? { newOrders: [] };
}
