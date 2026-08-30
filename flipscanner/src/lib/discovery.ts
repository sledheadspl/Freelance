import { supabase } from './supabase';
import type { Database } from '../types/database';

export type DiscoveryRow = Database['public']['Tables']['discoveries']['Row'];

/** Uploads a captured photo to the user's discovery-images folder and returns its storage path. */
export async function uploadDiscoveryImage(userId: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();

  const path = `${userId}/discoveries/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('scan-images').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return path;
}

interface IdentifyDiscoveryOptions {
  latitude?: number;
  longitude?: number;
}

interface IdentifyDiscoveryResponse {
  discovery: DiscoveryRow;
}

/** Calls the identify-discovery edge function for a previously-uploaded photo. */
export async function requestDiscoveryIdentification(
  storagePath: string,
  options: IdentifyDiscoveryOptions = {}
): Promise<DiscoveryRow> {
  const { data, error } = await supabase.functions.invoke<IdentifyDiscoveryResponse>('identify-discovery', {
    body: {
      storagePath,
      latitude: options.latitude,
      longitude: options.longitude,
      capturedAt: new Date().toISOString(),
    },
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error('No response from identify-discovery function');
  }

  return data.discovery;
}

/** Lists the user's discoveries, newest first. */
export async function listDiscoveries(
  userId: string,
  { limit = 30, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<DiscoveryRow[]> {
  const { data, error } = await supabase
    .from('discoveries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/** Updates whether a discovery is opted in to the (future) shared dataset. */
export async function setDiscoveryShared(discoveryId: string, shared: boolean): Promise<void> {
  const { error } = await supabase.from('discoveries').update({ shared }).eq('id', discoveryId);

  if (error) {
    throw new Error(error.message);
  }
}
