import { supabase } from './supabase';
import type { Database } from '../types/database';

export type InventoryRow = Database['public']['Tables']['inventory']['Row'];

interface GenerateListingResponse {
  inventory: InventoryRow;
}

/** Calls the generate-listing edge function to draft a title + description from the scan's identification. */
export async function generateListing(inventoryId: string): Promise<InventoryRow> {
  const { data, error } = await supabase.functions.invoke<GenerateListingResponse>('generate-listing', {
    body: { inventoryId },
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error('No response from generate-listing function');
  }

  return data.inventory;
}

/** Saves user edits to a listing draft (title, description, and/or listed price). */
export async function updateListingDraft(
  inventoryId: string,
  fields: { listing_title?: string; listing_description?: string; listed_price?: number | null }
): Promise<InventoryRow> {
  const { data, error } = await supabase
    .from('inventory')
    .update(fields)
    .eq('id', inventoryId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
