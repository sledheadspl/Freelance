import { getServiceClient } from '../_shared/supabaseClient.ts';
import { exchangeCodeForTokens, verifyOAuthState } from '../_shared/ebayOAuth.ts';

const APP_RETURN_URL = 'flipscanner://ebay-callback';

function htmlResponse(status: 'success' | 'error', message: string): Response {
  const redirectUrl = `${APP_RETURN_URL}?status=${status}`;
  const body = `<!DOCTYPE html>
<html>
  <head><meta http-equiv="refresh" content="0; url=${redirectUrl}" /></head>
  <body>
    <p>${message}</p>
    <p><a href="${redirectUrl}">Return to FlipScanner</a></p>
  </body>
</html>`;

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return htmlResponse('error', 'Missing authorization code or state.');
  }

  let userId: string;
  try {
    userId = await verifyOAuthState(state);
  } catch (error) {
    console.error('eBay OAuth state verification failed', error);
    return htmlResponse('error', 'This connection link is invalid or has expired. Please try again from the app.');
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    const serviceClient = getServiceClient();
    const { error: updateError } = await serviceClient
      .from('profiles')
      .update({ ebay_connected: true, ebay_refresh_token: tokens.refreshToken ?? null })
      .eq('id', userId);

    if (updateError) {
      console.error('Failed to save eBay tokens', updateError);
      return htmlResponse('error', 'Connected to eBay, but saving the connection failed. Please try again.');
    }

    return htmlResponse('success', 'eBay account connected. You can return to FlipScanner.');
  } catch (error) {
    console.error('eBay OAuth token exchange failed', error);
    return htmlResponse('error', 'Could not complete the eBay connection. Please try again.');
  }
});
