import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from './supabase';

const BILLING_RETURN_URL =
  Platform.OS === 'web'
    ? 'https://flip.screwedscore.com/billing-callback'
    : 'flipscanner://billing-callback';

interface BillingUrlResponse {
  url: string;
}

/**
 * Starts a Stripe Checkout session for the Pro subscription and opens it in
 * an auth session. Returns true if the user completed the flow (the caller
 * should re-check the profile's `subscription_tier` to confirm success).
 */
export async function startProCheckout(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke<BillingUrlResponse>('create-checkout-session', {
    method: 'POST',
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.url) {
    throw new Error('No checkout URL returned');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, BILLING_RETURN_URL);
  return result.type === 'success';
}

/** Opens the Stripe Billing Portal so the user can manage or cancel their subscription. */
export async function openBillingPortal(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<BillingUrlResponse>('create-portal-session', {
    method: 'POST',
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.url) {
    throw new Error('No billing portal URL returned');
  }

  await WebBrowser.openAuthSessionAsync(data.url, BILLING_RETURN_URL);
}
