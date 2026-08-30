import { supabase } from './supabase';
import type { Database } from '../types/database';

export type InventoryRow = Database['public']['Tables']['inventory']['Row'];
export type ScanRow = Database['public']['Tables']['scans']['Row'];
export type InventoryWithScan = InventoryRow & { scans: ScanRow | null };

/** Returns the inventory row for a scan, if the user already marked it as bought. */
export async function getInventoryForScan(scanId: string): Promise<InventoryRow | null> {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('scan_id', scanId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/** Marks a scan as purchased, moving it into the user's inventory. */
export async function addToInventory(
  userId: string,
  scanId: string,
  purchasePrice: number
): Promise<InventoryRow> {
  const { data, error } = await supabase
    .from('inventory')
    .insert({ user_id: userId, scan_id: scanId, purchase_price: purchasePrice })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/** Lists the user's inventory, newest first, with the originating scan joined in. */
export async function listInventory(userId: string): Promise<InventoryWithScan[]> {
  const { data, error } = await supabase
    .from('inventory')
    .select('*, scans(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as InventoryWithScan[];
}
