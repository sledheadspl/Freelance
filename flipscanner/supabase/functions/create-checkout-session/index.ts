import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getUserClient } from '../_shared/supabaseClient.ts';
import { createCheckoutSession, createCustomer } from '../_shared/stripe.ts';

const CHECKOUT_RETURN_URL = 'flipscanner://billing-callback';

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

  const priceId = Deno.env.get('STRIPE_PRO_PRICE_ID');
  if (!priceId) {
    return jsonResponse({ error: 'Billing is not configured' }, { status: 500 });
  }

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return jsonResponse({ error: 'Could not load profile' }, { status: 500 });
  }

  let customerId = profile.stripe_customer_id;

  try {
    if (!customerId) {
      customerId = await createCustomer(user.id, user.email ?? null);
      const { error: updateError } = await userClient
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
      if (updateError) {
        return jsonResponse({ error: 'Failed to save Stripe customer', details: updateError.message }, { status: 500 });
      }
    }

    const session = await createCheckoutSession(customerId, priceId, CHECKOUT_RETURN_URL, CHECKOUT_RETURN_URL);

    if (!session.url) {
      return jsonResponse({ error: 'Stripe did not return a checkout URL' }, { status: 502 });
    }

    return jsonResponse({ url: session.url }, { status: 200 });
  } catch (error) {
    return jsonResponse(
      { error: 'Failed to create checkout session', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
});
