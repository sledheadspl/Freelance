import { z } from 'npm:zod@^4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserClient } from '../_shared/supabaseClient.ts';
import { identifyItem } from '../_shared/anthropic.ts';

const FREE_TIER_MONTHLY_SCANS = 10;

const requestSchema = z.object({
  storagePath: z.string().min(1),
  textHint: z.string().max(500).optional(),
});

function mediaTypeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, { status: 401 });
  }

  const userClient = getUserClient(authHeader);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Invalid or expired session' }, { status: 401 });
  }
  const user = userData.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonResponse({ error: 'Invalid request', details: parsedBody.error.flatten() }, { status: 400 });
  }
  const { storagePath, textHint } = parsedBody.data;

  if (!storagePath.startsWith(`${user.id}/`)) {
    return jsonResponse({ error: 'storagePath must be within your own folder' }, { status: 403 });
  }

  // Rate limit per spec section 9/11: free tier capped at 10 scans/month, enforced server-side.
  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('subscription_tier, scans_this_month')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return jsonResponse({ error: 'Could not load profile' }, { status: 500 });
  }

  if (profile.subscription_tier === 'free' && profile.scans_this_month >= FREE_TIER_MONTHLY_SCANS) {
    return jsonResponse(
      { error: 'Monthly scan limit reached. Upgrade to Pro for unlimited scans.' },
      { status: 429 }
    );
  }

  // Download the uploaded photo from Storage.
  const { data: imageBlob, error: downloadError } = await userClient.storage
    .from('scan-images')
    .download(storagePath);

  if (downloadError || !imageBlob) {
    return jsonResponse({ error: 'Could not load uploaded image' }, { status: 404 });
  }

  const base64Image = await blobToBase64(imageBlob);
  const mediaType = mediaTypeForPath(storagePath);

  let identification;
  try {
    identification = await identifyItem({ base64Image, mediaType, textHint });
  } catch (error) {
    return jsonResponse(
      { error: 'Item identification failed', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }

  const serviceClient = getServiceClient();

  const { data: scan, error: insertError } = await serviceClient
    .from('scans')
    .insert({
      user_id: user.id,
      image_url: storagePath,
      identified_name: identification.item_name,
      identified_category: identification.category,
      identified_attributes: {
        brand: identification.brand,
        model: identification.model,
        part_number: identification.part_number,
        condition_estimate: identification.condition_estimate,
        search_query: identification.search_query,
        notable_flaws: identification.notable_flaws,
        id_confidence: identification.id_confidence,
      },
    })
    .select()
    .single();

  if (insertError || !scan) {
    return jsonResponse(
      { error: 'Failed to save scan', details: insertError?.message },
      { status: 500 }
    );
  }

  await serviceClient
    .from('profiles')
    .update({ scans_this_month: profile.scans_this_month + 1 })
    .eq('id', user.id);

  return jsonResponse({ scan, identification }, { status: 200 });
});
