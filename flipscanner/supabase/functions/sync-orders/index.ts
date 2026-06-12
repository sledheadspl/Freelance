import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserClient } from '../_shared/supabaseClient.ts';
import { getUserAccessToken } from '../_shared/ebaySell.ts';
import { fetchUnfulfilledOrders } from '../_shared/ebayFulfillment.ts';
import { sendPushNotification } from '../_shared/pushNotifications.ts';

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
  const user = userData.user;

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('ebay_connected, ebay_refresh_token, push_token')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return jsonResponse({ error: 'Could not load profile' }, { status: 500 });
  }

  if (!profile.ebay_connected || !profile.ebay_refresh_token) {
    return jsonResponse({ newOrders: [] }, { status: 200 });
  }

  let accessToken: string;
  try {
    accessToken = await getUserAccessToken(profile.ebay_refresh_token);
  } catch (error) {
    return jsonResponse(
      { error: 'eBay authorization expired. Reconnect your eBay account in Settings.', details: error instanceof Error ? error.message : String(error) },
      { status: 401 }
    );
  }

  let ebayOrders;
  try {
    ebayOrders = await fetchUnfulfilledOrders(accessToken);
  } catch (error) {
    return jsonResponse(
      { error: 'Failed to fetch eBay orders', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }

  const serviceClient = getServiceClient();
  const newOrders: Array<{ inventoryId: string; ebayOrderId: string }> = [];

  for (const ebayOrder of ebayOrders) {
    for (const lineItem of ebayOrder.lineItems) {
      if (!lineItem.sku) continue;

      const { data: inventoryItem } = await serviceClient
        .from('inventory')
        .select('id, status')
        .eq('id', lineItem.sku)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!inventoryItem || inventoryItem.status !== 'listed') continue;

      const { data: existingOrder } = await serviceClient
        .from('orders')
        .select('id')
        .eq('ebay_order_id', ebayOrder.orderId)
        .eq('inventory_id', inventoryItem.id)
        .maybeSingle();

      if (existingOrder) continue;

      await serviceClient.from('orders').insert({
        user_id: user.id,
        inventory_id: inventoryItem.id,
        ebay_order_id: ebayOrder.orderId,
        buyer_username: ebayOrder.buyerUsername,
        ship_by: ebayOrder.shipByDate ? ebayOrder.shipByDate.slice(0, 10) : null,
        status: 'awaiting_shipment',
      });

      await serviceClient
        .from('inventory')
        .update({
          status: 'sold',
          sold_price: lineItem.lineItemCost,
          sold_at: ebayOrder.creationDate ?? new Date().toISOString(),
        })
        .eq('id', inventoryItem.id);

      newOrders.push({ inventoryId: inventoryItem.id, ebayOrderId: ebayOrder.orderId });
    }
  }

  if (newOrders.length > 0 && profile.push_token) {
    const message =
      newOrders.length === 1
        ? 'One of your items just sold on eBay!'
        : `${newOrders.length} of your items just sold on eBay!`;
    await sendPushNotification(profile.push_token, 'Item sold!', message);
  }

  return jsonResponse({ newOrders }, { status: 200 });
});
