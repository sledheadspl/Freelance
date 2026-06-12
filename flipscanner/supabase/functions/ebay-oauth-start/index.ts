import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getUserClient } from '../_shared/supabaseClient.ts';
import { buildAuthorizationUrl } from '../_shared/ebayOAuth.ts';

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

  try {
    const url = await buildAuthorizationUrl(userData.user.id);
    return jsonResponse({ url }, { status: 200 });
  } catch (error) {
    return jsonResponse(
      { error: 'eBay OAuth is not configured', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
