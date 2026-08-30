// eBay Fulfillment API helpers for order polling (Build Order step 10).

import { getEbayApiBaseUrl } from './ebayOAuth.ts';

export interface EbayOrderLineItem {
  sku: string | null;
  lineItemCost: number | null;
}

export interface EbayOrder {
  orderId: string;
  buyerUsername: string | null;
  creationDate: string | null;
  shipByDate: string | null;
  lineItems: EbayOrderLineItem[];
}

/** Fetches orders that still need fulfillment, for matching against listed inventory. */
export async function fetchUnfulfilledOrders(accessToken: string): Promise<EbayOrder[]> {
  const params = new URLSearchParams({
    filter: 'orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}',
    limit: '50',
  });

  const response = await fetch(`${getEbayApiBaseUrl()}/sell/fulfillment/v1/order?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch eBay orders: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const orders = Array.isArray(data.orders) ? data.orders : [];

  return orders.map((order: Record<string, unknown>): EbayOrder => {
    const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
    const fulfillmentInstructions = Array.isArray(order.fulfillmentStartInstructions)
      ? order.fulfillmentStartInstructions
      : [];
    const shipByDate =
      fulfillmentInstructions[0]?.shippingStep?.shipByDate ??
      lineItems[0]?.lineItemFulfillmentInstructions?.shipByDate ??
      null;

    return {
      orderId: String(order.orderId),
      buyerUsername: typeof order.buyer?.username === 'string' ? order.buyer.username : null,
      creationDate: typeof order.creationDate === 'string' ? order.creationDate : null,
      shipByDate: typeof shipByDate === 'string' ? shipByDate : null,
      lineItems: lineItems.map((item: Record<string, unknown>): EbayOrderLineItem => {
        const cost = (item.total as Record<string, unknown> | undefined)?.value;
        return {
          sku: typeof item.sku === 'string' ? item.sku : null,
          lineItemCost: typeof cost === 'string' ? Number(cost) : null,
        };
      }),
    };
  });
}
