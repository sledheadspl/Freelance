import { jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabaseClient.ts';
import { verifyStripeSignature } from '../_shared/stripe.ts';

interface StripeEvent {
  type: string;
  data: {
    object: {
      id: string;
      customer?: string | null;
      subscription?: string | null;
      status?: string;
    };
  };
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    return jsonResponse({ error: 'Webhook is not configured' }, { status: 500 });
  }

  const signature = req.headers.get('Stripe-Signature');
  if (!signature) {
    return jsonResponse({ error: 'Missing Stripe-Signature header' }, { status: 400 });
  }

  const payload = await req.text();
  const valid = await verifyStripeSignature(payload, signature, webhookSecret);
  if (!valid) {
    return jsonResponse({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const supabase = getServiceClient();
  const object = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const customerId = object.customer;
      const subscriptionId = object.subscription;
      if (customerId && subscriptionId) {
        await supabase
          .from('profiles')
          .update({ subscription_tier: 'pro', stripe_subscription_id: subscriptionId })
          .eq('stripe_customer_id', customerId);
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.created': {
      const customerId = object.customer;
      if (customerId) {
        const tier = ACTIVE_SUBSCRIPTION_STATUSES.has(object.status ?? '') ? 'pro' : 'free';
        await supabase
          .from('profiles')
          .update({ subscription_tier: tier, stripe_subscription_id: object.id })
          .eq('stripe_customer_id', customerId);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const customerId = object.customer;
      if (customerId) {
        await supabase
          .from('profiles')
          .update({ subscription_tier: 'free', stripe_subscription_id: null })
          .eq('stripe_customer_id', customerId);
      }
      break;
    }
  }

  return jsonResponse({ received: true }, { status: 200 });
});
