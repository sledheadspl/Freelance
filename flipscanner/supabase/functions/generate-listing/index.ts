import { z } from 'npm:zod@^4';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getUserClient } from '../_shared/supabaseClient.ts';
import { generateListingDraft } from '../_shared/listing.ts';

interface IdentifiedAttributes {
  brand?: string | null;
  model?: string | null;
  part_number?: string | null;
  condition_estimate?: string | null;
  notable_flaws?: string[];
}

const requestSchema = z.object({
  inventoryId: z.string().uuid(),
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
    .select('*, scans(identified_name, identified_category, identified_attributes)')
    .eq('id', parsedBody.data.inventoryId)
    .single();

  if (itemError || !item) {
    return jsonResponse({ error: 'Inventory item not found' }, { status: 404 });
  }

  const scan = item.scans as {
    identified_name: string | null;
    identified_category: string | null;
    identified_attributes: IdentifiedAttributes | null;
  } | null;

  if (!scan?.identified_name || !scan.identified_category) {
    return jsonResponse({ error: 'Inventory item has no identified scan to generate a listing from' }, { status: 400 });
  }

  const attributes = scan.identified_attributes ?? {};

  let draft;
  try {
    draft = await generateListingDraft({
      itemName: scan.identified_name,
      category: scan.identified_category,
      brand: attributes.brand,
      model: attributes.model,
      partNumber: attributes.part_number,
      conditionEstimate: attributes.condition_estimate,
      notableFlaws: attributes.notable_flaws,
    });
  } catch (error) {
    return jsonResponse(
      { error: 'Listing generation failed', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }

  const { data: updated, error: updateError } = await userClient
    .from('inventory')
    .update({ listing_title: draft.title, listing_description: draft.description })
    .eq('id', parsedBody.data.inventoryId)
    .select()
    .single();

  if (updateError || !updated) {
    return jsonResponse({ error: 'Failed to save listing draft', details: updateError?.message }, { status: 500 });
  }

  return jsonResponse({ inventory: updated }, { status: 200 });
});
