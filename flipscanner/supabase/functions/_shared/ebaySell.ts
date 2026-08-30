// eBay Sell API helpers for publishing inventory items as live listings
// (Build Order step 9). Uses the user's OAuth access token (refreshed from
// the stored refresh token) against the Inventory API.

import { getEbayApiBaseUrl, refreshAccessToken } from './ebayOAuth.ts';

const EBAY_SELL_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EBAY_SELL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export interface EbayListingInput {
  sku: string;
  title: string;
  description: string;
  imageUrls: string[];
  conditionEstimate: string | null;
  categoryId: string;
  price: number;
  quantity?: number;
}

export interface EbayPublishResult {
  offerId: string;
  listingId: string;
}

const CONDITION_MAP: Record<string, string> = {
  new: 'NEW',
  like_new: 'LIKE_NEW',
  good: 'USED_GOOD',
  fair: 'USED_ACCEPTABLE',
  parts_only: 'FOR_PARTS_OR_NOT_WORKING',
};

/** Maps FlipScanner's condition estimate to an eBay Inventory API condition enum. */
export function mapConditionToEbay(conditionEstimate: string | null): string {
  if (conditionEstimate && CONDITION_MAP[conditionEstimate]) {
    return CONDITION_MAP[conditionEstimate];
  }
  return 'USED_GOOD';
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Exchanges the stored eBay refresh token for a fresh access token.
 * eBay rotates the refresh token on every use — the caller MUST persist the
 * new refreshToken to profiles.ebay_refresh_token before using the access token.
 */
export async function getUserAccessToken(refreshToken: string): Promise<RefreshedTokens> {
  const tokens = await refreshAccessToken(refreshToken);
  if (!tokens.refreshToken) {
    throw new Error('eBay token refresh did not return a new refresh token');
  }
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

async function ebayRequest(accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetchWithTimeout(`${getEbayApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-US',
      ...(init.headers ?? {}),
    },
  });
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

/** Creates or replaces an Inventory Item (Sell Inventory API) for the given SKU. */
export async function upsertInventoryItem(accessToken: string, input: EbayListingInput): Promise<void> {
  const body = {
    availability: {
      shipToLocationAvailability: { quantity: input.quantity ?? 1 },
    },
    condition: mapConditionToEbay(input.conditionEstimate),
    product: {
      title: input.title.slice(0, 80),
      description: input.description,
      imageUrls: input.imageUrls,
    },
  };

  const response = await ebayRequest(accessToken, `/sell/inventory/v1/inventory_item/${input.sku}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to create inventory item: ${response.status} ${await readErrorBody(response)}`);
  }
}

/** Creates a fixed-price offer for a previously-created Inventory Item. */
export async function createOffer(accessToken: string, input: EbayListingInput): Promise<string> {
  const marketplaceId = Deno.env.get('EBAY_MARKETPLACE_ID') ?? 'EBAY_US';
  const merchantLocationKey = Deno.env.get('EBAY_MERCHANT_LOCATION_KEY');
  const fulfillmentPolicyId = Deno.env.get('EBAY_FULFILLMENT_POLICY_ID');
  const paymentPolicyId = Deno.env.get('EBAY_PAYMENT_POLICY_ID');
  const returnPolicyId = Deno.env.get('EBAY_RETURN_POLICY_ID');

  if (!merchantLocationKey || !fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
    throw new Error(
      'eBay seller account is not fully configured: set EBAY_MERCHANT_LOCATION_KEY, ' +
        'EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID, and EBAY_RETURN_POLICY_ID.'
    );
  }

  const body = {
    sku: input.sku,
    marketplaceId,
    format: 'FIXED_PRICE',
    availableQuantity: input.quantity ?? 1,
    categoryId: input.categoryId,
    listingDescription: input.description,
    pricingSummary: {
      price: { value: input.price.toFixed(2), currency: 'USD' },
    },
    merchantLocationKey,
    listingPolicies: {
      fulfillmentPolicyId,
      paymentPolicyId,
      returnPolicyId,
    },
  };

  const response = await ebayRequest(accessToken, '/sell/inventory/v1/offer', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to create offer: ${response.status} ${await readErrorBody(response)}`);
  }

  const data = await response.json();
  return data.offerId;
}

/** Publishes a previously-created offer, making it a live eBay listing. */
export async function publishOffer(accessToken: string, offerId: string): Promise<string> {
  const response = await ebayRequest(accessToken, `/sell/inventory/v1/offer/${offerId}/publish`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to publish offer: ${response.status} ${await readErrorBody(response)}`);
  }

  const data = await response.json();
  return data.listingId;
}

/** Runs the full publish pipeline: inventory item -> offer -> publish. */
export async function publishListing(accessToken: string, input: EbayListingInput): Promise<EbayPublishResult> {
  await upsertInventoryItem(accessToken, input);
  const offerId = await createOffer(accessToken, input);
  const listingId = await publishOffer(accessToken, offerId);
  return { offerId, listingId };
}
