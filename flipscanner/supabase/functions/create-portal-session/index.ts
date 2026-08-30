import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getUserClient } from '../_shared/supabaseClient.ts';
import { createBillingPortalSession } from '../_shared/stripe.ts';

const PORTAL_RETURN_URL = 'flipscanner://billing-callback';

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

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) {
    return jsonResponse({ error: 'Could not load profile' }, { status: 500 });
  }
  if (!profile.stripe_customer_id) {
    return jsonResponse({ error: 'No billing account found for this user' }, { status: 400 });
  }

  try {
    const session = await createBillingPortalSession(profile.stripe_customer_id, PORTAL_RETURN_URL);
    return jsonResponse({ url: session.url }, { status: 200 });
  } catch (error) {
    return jsonResponse(
      { error: 'Failed to create billing portal session', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
});
