import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from './supabase';

const EBAY_RETURN_URL =
  Platform.OS === 'web'
    ? 'https://flip.screwedscore.com/ebay-callback'
    : 'flipscanner://ebay-callback';

interface EbayOAuthStartResponse {
  url: string;
}

/** Returns whether the signed-in user's profile has an eBay account connected. */
export async function getEbayConnected(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('ebay_connected').eq('id', userId).single();

  if (error) {
    throw new Error(error.message);
  }

  return data.ebay_connected;
}

/**
 * Opens the eBay consent screen in an auth session and waits for the
 * redirect back to the app. Returns true if the user completed the flow
 * (the caller should re-check `getEbayConnected` to confirm success).
 */
export async function connectEbayAccount(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke<EbayOAuthStartResponse>('ebay-oauth-start', {
    method: 'POST',
    body: { returnUrl: EBAY_RETURN_URL },
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.url) {
    throw new Error('No eBay authorization URL returned');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, EBAY_RETURN_URL);
  return result.type === 'success';
}

// Exported so the ebay-oauth-start call can include the right returnUrl.
export { EBAY_RETURN_URL };
