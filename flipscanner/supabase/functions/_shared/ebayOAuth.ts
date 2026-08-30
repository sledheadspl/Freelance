// eBay user OAuth (authorization code grant) for the "Connect eBay" flow,
// spec section 9 (Sell APIs). Defaults to the sandbox environment until the
// app is approved for production Sell API access.

const SELL_SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
].join(' ');

export interface EbayTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  refreshTokenExpiresIn?: number;
}

function isSandbox(): boolean {
  return Deno.env.get('EBAY_ENV') !== 'production';
}

export function getEbayAuthBaseUrl(): string {
  return isSandbox() ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com';
}

export function getEbayApiBaseUrl(): string {
  return isSandbox() ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getStateSigningKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('EBAY_OAUTH_STATE_SECRET');
  if (!secret) {
    throw new Error('EBAY_OAUTH_STATE_SECRET is not configured');
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Signs an opaque state token binding the OAuth flow to a user id, with a short expiry.
 *  returnUrl is where the callback edge function redirects the browser after processing. */
export async function signOAuthState(userId: string, returnUrl: string): Promise<string> {
  const key = await getStateSigningKey();
  const payload = JSON.stringify({ userId, returnUrl, exp: Date.now() + 10 * 60 * 1000 });
  const payloadBytes = new TextEncoder().encode(payload);
  const signature = await crypto.subtle.sign('HMAC', key, payloadBytes);
  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export interface OAuthStatePayload {
  userId: string;
  returnUrl: string;
}

/** Verifies a state token produced by signOAuthState, returning the payload. */
export async function verifyOAuthState(state: string): Promise<OAuthStatePayload> {
  const [payloadPart, signaturePart] = state.split('.');
  if (!payloadPart || !signaturePart) {
    throw new Error('Malformed state');
  }

  const key = await getStateSigningKey();
  const payloadBytes = base64UrlDecode(payloadPart);
  const signatureBytes = base64UrlDecode(signaturePart);

  const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);
  if (!valid) {
    throw new Error('Invalid state signature');
  }

  const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as { userId: string; returnUrl?: string; exp: number };
  if (Date.now() > payload.exp) {
    throw new Error('State expired');
  }

  return { userId: payload.userId, returnUrl: payload.returnUrl ?? 'flipscanner://ebay-callback' };
}

/** Builds the eBay consent screen URL for the authorization code grant.
 *  appReturnUrl is where the browser is redirected after the callback processes the code. */
export async function buildAuthorizationUrl(userId: string, appReturnUrl: string): Promise<string> {
  const clientId = Deno.env.get('EBAY_CLIENT_ID');
  const redirectUri = Deno.env.get('EBAY_OAUTH_REDIRECT_URI');
  if (!clientId || !redirectUri) {
    throw new Error('EBAY_CLIENT_ID / EBAY_OAUTH_REDIRECT_URI are not configured');
  }

  const state = await signOAuthState(userId, appReturnUrl);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SELL_SCOPES,
    state,
  });

  return `${getEbayAuthBaseUrl()}/oauth2/authorize?${params.toString()}`;
}

async function requestTokens(body: string): Promise<EbayTokens> {
  const clientId = Deno.env.get('EBAY_CLIENT_ID');
  const clientSecret = Deno.env.get('EBAY_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not configured');
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch(`${getEbayApiBaseUrl()}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`eBay token request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    refreshTokenExpiresIn: data.refresh_token_expires_in,
  };
}

/** Exchanges an authorization code for a user access + refresh token pair. */
export async function exchangeCodeForTokens(code: string): Promise<EbayTokens> {
  const redirectUri = Deno.env.get('EBAY_OAUTH_REDIRECT_URI');
  if (!redirectUri) {
    throw new Error('EBAY_OAUTH_REDIRECT_URI is not configured');
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  return requestTokens(params.toString());
}

/** Exchanges a stored refresh token for a fresh access token. */
export async function refreshAccessToken(refreshToken: string): Promise<EbayTokens> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SELL_SCOPES,
  });

  return requestTokens(params.toString());
}
