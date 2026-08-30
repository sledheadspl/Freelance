import { z } from 'npm:zod@^4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserClient } from '../_shared/supabaseClient.ts';
import { suggestCategoryId } from '../_shared/ebayCategory.ts';
import { getUserAccessToken, publishListing } from '../_shared/ebaySell.ts';

const requestSchema = z.object({
  inventoryId: z.string().uuid(),
});

const SIGNED_IMAGE_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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

  const { data: item, error: itemError } = await userClient
    .from('inventory')
    .select('*, scans(identified_name, identified_category, identified_attributes, image_url)')
    .eq('id', parsedBody.data.inventoryId)
    .single();

  if (itemError || !item) {
    return jsonResponse({ error: 'Inventory item not found' }, { status: 404 });
  }

  if (!item.listing_title || !item.listing_description) {
    return jsonResponse({ error: 'Generate and save a listing draft before publishing.' }, { status: 400 });
  }
  if (item.listed_price == null) {
    return jsonResponse({ error: 'Set a listing price before publishing.' }, { status: 400 });
  }
  if (item.status !== 'unlisted') {
    return jsonResponse({ error: `Item is already ${item.status}.` }, { status: 400 });
  }

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('ebay_connected, ebay_refresh_token')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.ebay_connected || !profile.ebay_refresh_token) {
    return jsonResponse({ error: 'Connect your eBay account in Settings before publishing.' }, { status: 400 });
  }

  const scan = item.scans as {
    identified_name: string | null;
    identified_category: string | null;
    identified_attributes: { condition_estimate?: string | null; search_query?: string } | null;
    image_url: string | null;
  } | null;

  if (!scan?.image_url) {
    return jsonResponse({ error: 'No photo found for this item.' }, { status: 400 });
  }

  const { data: signed, error: signError } = await userClient.storage
    .from('scan-images')
    .createSignedUrl(scan.image_url, SIGNED_IMAGE_URL_TTL_SECONDS);

  if (signError || !signed) {
    return jsonResponse({ error: 'Could not generate an image URL for eBay.' }, { status: 500 });
  }

  const categoryQuery = scan.identified_attributes?.search_query ?? scan.identified_name ?? item.listing_title;
  const categoryId = await suggestCategoryId(categoryQuery);
  if (!categoryId) {
    return jsonResponse(
      { error: 'Could not determine an eBay category. Set EBAY_DEFAULT_CATEGORY_ID.' },
      { status: 500 }
    );
  }

  let accessToken: string;
  try {
    accessToken = await getUserAccessToken(profile.ebay_refresh_token);
  } catch (error) {
    return jsonResponse(
      { error: 'eBay authorization expired. Reconnect your eBay account in Settings.', details: error instanceof Error ? error.message : String(error) },
      { status: 401 }
    );
  }

  let result;
  try {
    result = await publishListing(accessToken, {
      sku: item.id,
      title: item.listing_title,
      description: item.listing_description,
      imageUrls: [signed.signedUrl],
      conditionEstimate: scan.identified_attributes?.condition_estimate ?? null,
      categoryId,
      price: item.listed_price,
    });
  } catch (error) {
    return jsonResponse(
      { error: 'Failed to publish listing to eBay', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }

  const serviceClient = getServiceClient();
  const { data: updated, error: updateError } = await serviceClient
    .from('inventory')
    .update({
      status: 'listed',
      ebay_offer_id: result.offerId,
      ebay_listing_id: result.listingId,
    })
    .eq('id', item.id)
    .select()
    .single();

  if (updateError || !updated) {
    return jsonResponse({ error: 'Listed on eBay, but failed to save the listing id.', details: updateError?.message }, { status: 500 });
  }

  return jsonResponse({ inventory: updated }, { status: 200 });
});
