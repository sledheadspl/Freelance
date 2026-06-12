import { supabase } from './supabase';
import type { Database } from '../types/database';

export type ScanRow = Database['public']['Tables']['scans']['Row'];

/** Uploads a captured photo to the user's scan-images folder and returns its storage path. */
export async function uploadScanImage(userId: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();

  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('scan-images').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return path;
}

interface ScanResponse {
  scan: ScanRow;
}

/** Calls the /scan edge function to identify the item in a previously-uploaded photo. */
export async function requestScan(storagePath: string, textHint?: string): Promise<ScanRow> {
  const { data, error } = await supabase.functions.invoke<ScanResponse>('scan', {
    body: { storagePath, textHint },
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error('No response from scan function');
  }

  return data.scan;
}
