const STRIPE_API_BASE = 'https://api.stripe.com/v1';

function getSecretKey(): string {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return key;
}

async function stripeRequest<T>(path: string, params: Record<string, string>): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Stripe API error: ${body?.error?.message ?? response.statusText}`);
  }
  return body as T;
}

interface StripeCustomer {
  id: string;
}

/** Finds or creates a Stripe customer for the given Supabase user, returning its id. */
export async function getOrCreateCustomer(userId: string, email: string | null): Promise<string> {
  const params: Record<string, string> = { 'metadata[supabase_user_id]': userId };
  if (email) {
    params.email = email;
  }

  const customer = await stripeRequest<StripeCustomer>('/customers', params);
  return customer.id;
}

interface StripeCheckoutSession {
  id: string;
  url: string | null;
}

/** Creates a Stripe Checkout session for the Pro subscription price. */
export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<StripeCheckoutSession> {
  return stripeRequest<StripeCheckoutSession>('/checkout/sessions', {
    customer: customerId,
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

interface StripeBillingPortalSession {
  id: string;
  url: string;
}

/** Creates a Stripe Billing Portal session for an existing customer to manage their subscription. */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<StripeBillingPortalSession> {
  return stripeRequest<StripeBillingPortalSession>('/billing_portal/sessions', {
    customer: customerId,
    return_url: returnUrl,
  });
}

/**
 * Verifies a Stripe webhook signature (the `Stripe-Signature` header) against
 * the raw request body using the webhook signing secret.
 */
export async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  webhookSecret: string
): Promise<boolean> {
  const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) acc[key] = value;
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(signatureBytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return expected === signature;
}
