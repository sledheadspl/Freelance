import { z } from 'npm:zod@^4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserClient } from '../_shared/supabaseClient.ts';
import { identifyItem } from '../_shared/anthropic.ts';
import { getComps } from '../_shared/comps.ts';
import { computeRoi } from '../_shared/roi.ts';
import { blobToBase64, mediaTypeForPath } from '../_shared/image.ts';

const FREE_TIER_MONTHLY_SCANS = 10;

const requestSchema = z.object({
  storagePath: z.string().min(1),
  textHint: z.string().max(500).optional(),
  purchasePrice: z.number().positive().optional(),
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
  const { storagePath, textHint, purchasePrice } = parsedBody.data;

  if (!storagePath.startsWith(`${user.id}/`)) {
    return jsonResponse({ error: 'storagePath must be within your own folder' }, { status: 403 });
  }

  // Rate limit: atomic increment that rejects if the free-tier cap is reached.
  // Using an RPC avoids the read-check-write race condition on concurrent requests.
  const serviceClient = getServiceClient();
  const { data: newCount, error: rpcError } = await serviceClient.rpc('increment_scan_count', {
    p_user_id: user.id,
    p_monthly_limit: FREE_TIER_MONTHLY_SCANS,
  });

  if (rpcError) {
    return jsonResponse({ error: 'Could not load profile' }, { status: 500 });
  }

  if (newCount == null) {
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

  // eBay sold comps + ROI (spec section 6 & 8). Failures here shouldn't block
  // the identification result — they just leave pricing fields null (grade D).
  let roi;
  try {
    const { comps, activeListingCount } = await getComps(identification.search_query);
    roi = computeRoi({
      comps,
      category: identification.category,
      conditionEstimate: identification.condition_estimate,
      activeListingCount,
      purchasePrice,
    });
  } catch (error) {
    console.error('Comps/ROI pipeline failed', error);
    roi = computeRoi({ comps: [], category: identification.category });
  }

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
      est_sale_price: roi.estSalePrice,
      est_sale_low: roi.estSaleLow,
      est_sale_high: roi.estSaleHigh,
      comps_count: roi.compsCount,
      sell_through_days: roi.sellThroughDays,
      confidence_grade: roi.confidenceGrade,
      recommendation: roi.recommendation,
      max_buy_price: roi.maxBuyPrice,
    })
    .select()
    .single();

  if (insertError || !scan) {
    return jsonResponse(
      { error: 'Failed to save scan', details: insertError?.message },
      { status: 500 }
    );
  }

  return jsonResponse(
    {
      scan,
      identification,
      roi: { net: roi.net, roiPct: roi.roiPct, fees: roi.fees, shippingCost: roi.shippingCost },
    },
    { status: 200 }
  );
});
