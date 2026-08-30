import type { CompInput } from './roi.ts';
import { getServiceClient } from './supabaseClient.ts';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h, per spec section 8
const REQUEST_TIMEOUT_MS = 15_000;

export interface CompsResult {
  comps: CompInput[];
  activeListingCount: number | null;
}

export function normalizeQueryKey(searchQuery: string): string {
  return searchQuery.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

let cachedEbayToken: { token: string; expiresAt: number } | null = null;

/** Client-credentials OAuth for the eBay Browse API (read-only scope). */
async function getEbayAppToken(): Promise<string | null> {
  const clientId = Deno.env.get('EBAY_CLIENT_ID');
  const clientSecret = Deno.env.get('EBAY_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;

  if (cachedEbayToken && cachedEbayToken.expiresAt > Date.now()) {
    return cachedEbayToken.token;
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetchWithTimeout('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });

  if (!response.ok) {
    console.error(`eBay OAuth failed: ${response.status} ${await response.text()}`);
    return null;
  }

  const data = await response.json();
  cachedEbayToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedEbayToken.token;
}

/** Active listing count for the search query, used as the sell-through denominator. */
async function fetchActiveListingCount(searchQuery: string): Promise<number | null> {
  try {
    const token = await getEbayAppToken();
    if (!token) return null;

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchQuery)}&limit=1`;
    const response = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });

    if (!response.ok) {
      console.error(`eBay Browse API failed: ${response.status} ${await response.text()}`);
      return null;
    }

    const data = await response.json();
    return typeof data.total === 'number' ? data.total : null;
  } catch (error) {
    console.error('fetchActiveListingCount error', error);
    return null;
  }
}

/**
 * Fallback sold-comps source while eBay Marketplace Insights API access is
 * pending (spec section 8). Calls an Apify actor that scrapes eBay sold
 * listings, if `APIFY_TOKEN` / `APIFY_SOLD_LISTINGS_ACTOR_ID` are configured.
 */
async function fetchSoldCompsFromApify(searchQuery: string): Promise<CompInput[]> {
  const token = Deno.env.get('APIFY_TOKEN');
  const actorId = Deno.env.get('APIFY_SOLD_LISTINGS_ACTOR_ID');
  if (!token || !actorId) return [];

  try {
    const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery, maxItems: 60 }),
    });

    if (!response.ok) {
      console.error(`Apify sold-listings actor failed: ${response.status} ${await response.text()}`);
      return [];
    }

    const items = await response.json();
    if (!Array.isArray(items)) return [];

    return items
      .map((item): CompInput | null => {
        const title = typeof item.title === 'string' ? item.title : null;
        const soldPrice = Number(item.soldPrice ?? item.price);
        const soldDate = typeof item.soldDate === 'string' ? item.soldDate : null;
        const condition = typeof item.condition === 'string' ? item.condition : 'used';

        if (!title || !soldDate || !Number.isFinite(soldPrice)) return null;
        return { title, sold_price: soldPrice, sold_date: soldDate, condition };
      })
      .filter((item): item is CompInput => item !== null);
  } catch (error) {
    console.error('fetchSoldCompsFromApify error', error);
    return [];
  }
}

/**
 * Returns sold comps + active listing count for a search query, using the
 * 24h comps_cache to avoid repeated scraper/API calls (spec section 8).
 */
export async function getComps(searchQuery: string): Promise<CompsResult> {
  const queryKey = normalizeQueryKey(searchQuery);
  const serviceClient = getServiceClient();

  const { data: cached } = await serviceClient
    .from('comps_cache')
    .select('comps, fetched_at, active_listing_count')
    .eq('query_key', queryKey)
    .maybeSingle();

  if (cached?.comps && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return {
      comps: cached.comps as CompInput[],
      activeListingCount: cached.active_listing_count ?? null,
    };
  }

  const [comps, activeListingCount] = await Promise.all([
    fetchSoldCompsFromApify(searchQuery),
    fetchActiveListingCount(searchQuery),
  ]);

  await serviceClient
    .from('comps_cache')
    .upsert(
      { query_key: queryKey, comps, active_listing_count: activeListingCount, fetched_at: new Date().toISOString() },
      { onConflict: 'query_key' }
    );

  return { comps, activeListingCount };
}
