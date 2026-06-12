// eBay category lookup for listing publication (Build Order step 9). The
// Taxonomy API is only available on the production endpoint, even when the
// rest of the Sell flow runs against the sandbox, so this uses its own
// client-credentials token against api.ebay.com.

const DEFAULT_CATEGORY_TREE_ID = '0'; // EBAY_US

let cachedAppToken: { token: string; expiresAt: number } | null = null;

async function getProductionAppToken(): Promise<string | null> {
  const clientId = Deno.env.get('EBAY_CLIENT_ID');
  const clientSecret = Deno.env.get('EBAY_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;

  if (cachedAppToken && cachedAppToken.expiresAt > Date.now()) {
    return cachedAppToken.token;
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });

  if (!response.ok) {
    console.error(`eBay app token request failed: ${response.status} ${await response.text()}`);
    return null;
  }

  const data = await response.json();
  cachedAppToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedAppToken.token;
}

/**
 * Suggests an eBay leaf category id for a search query via the Taxonomy API,
 * falling back to `EBAY_DEFAULT_CATEGORY_ID` if the lookup fails or isn't
 * configured.
 */
export async function suggestCategoryId(query: string): Promise<string | null> {
  const fallback = Deno.env.get('EBAY_DEFAULT_CATEGORY_ID') ?? null;

  try {
    const token = await getProductionAppToken();
    if (!token) return fallback;

    const url = `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${DEFAULT_CATEGORY_TREE_ID}/get_category_suggestions?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error(`eBay Taxonomy API failed: ${response.status} ${await response.text()}`);
      return fallback;
    }

    const data = await response.json();
    const categoryId = data?.categorySuggestions?.[0]?.category?.categoryId;
    return typeof categoryId === 'string' ? categoryId : fallback;
  } catch (error) {
    console.error('suggestCategoryId error', error);
    return fallback;
  }
}
