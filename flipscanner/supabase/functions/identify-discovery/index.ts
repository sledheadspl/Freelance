import { z } from 'npm:zod@^4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserClient } from '../_shared/supabaseClient.ts';
import { identifyDiscovery } from '../_shared/discoveryIdentify.ts';
import { blobToBase64, mediaTypeForPath } from '../_shared/image.ts';
import { getComps } from '../_shared/comps.ts';
import { computeRoi } from '../_shared/roi.ts';

const FREE_TIER_MONTHLY_SCANS = 10;

const requestSchema = z.object({
  storagePath: z.string().min(1),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  capturedAt: z.string().datetime().optional(),
});

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
  const { storagePath, latitude, longitude, capturedAt } = parsedBody.data;

  if (!storagePath.startsWith(`${user.id}/`)) {
    return jsonResponse({ error: 'storagePath must be within your own folder' }, { status: 403 });
  }

  // Discoveries share the same monthly scan budget as resale scans.
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

  const { data: imageBlob, error: downloadError } = await userClient.storage
    .from('scan-images')
    .download(storagePath);

  if (downloadError || !imageBlob) {
    return jsonResponse({ error: 'Could not load uploaded image' }, { status: 404 });
  }

  const base64Image = await blobToBase64(imageBlob);
  const mediaType = mediaTypeForPath(storagePath);

  let result;
  try {
    result = await identifyDiscovery({ base64Image, mediaType });
  } catch (error) {
    return jsonResponse(
      { error: 'Identification failed', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }

  // Cross-reference eBay sold comps for the identified item/material. For
  // terrain or material photos, similarly-titled listings (e.g. "gold claim",
  // "rockhounding site") are a useful qualitative signal even when there's no
  // direct resale price — surfaced via similar_listings below.
  let roi;
  let similarListings: string[] = [];
  try {
    const { comps, activeListingCount } = await getComps(result.search_query);
    similarListings = comps.slice(0, 5).map((comp) => comp.title);
    roi = computeRoi({ comps, category: result.category, activeListingCount });
  } catch (error) {
    console.error('Comps pipeline failed for discovery', error);
    roi = computeRoi({ comps: [], category: result.category });
  }

  const serviceClient = getServiceClient();

  const { data: discovery, error: insertError } = await serviceClient
    .from('discoveries')
    .insert({
      user_id: user.id,
      image_url: storagePath,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      captured_at: capturedAt ?? new Date().toISOString(),
      identified_name: result.name,
      identified_category: result.category,
      description: result.description,
      confidence_grade: result.confidence_grade,
      est_sale_price: roi.estSalePrice,
      est_sale_low: roi.estSaleLow,
      est_sale_high: roi.estSaleHigh,
      comps_count: roi.compsCount,
      identified_attributes: {
        notable_features: result.notable_features,
        next_steps: result.next_steps,
        search_query: result.search_query,
        similar_listings: similarListings,
      },
    })
    .select()
    .single();

  if (insertError || !discovery) {
    return jsonResponse({ error: 'Failed to save discovery', details: insertError?.message }, { status: 500 });
  }

  await serviceClient
    .from('profiles')
    .update({ scans_this_month: profile.scans_this_month + 1 })
    .eq('id', user.id);

  return jsonResponse({ discovery }, { status: 200 });
});
