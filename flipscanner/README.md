# FlipScanner

Mobile-first reseller app: scan items, get real eBay sold-comp pricing and an
ROI-based buy/skip recommendation, then manage inventory and listings.

This repo currently implements **Build Order steps 1-10**: project scaffold
(Expo + TypeScript strict mode), the Supabase database schema, Supabase
email/password auth, the camera scan flow (capture → upload → Claude vision
item identification → results screen), the eBay sold-comps + ROI pipeline
that powers the buy/skip recommendation, a scan history / watchlist UI, the
"I bought it" → inventory flow, the "Connect eBay" OAuth flow (sandbox), an
AI-generated draft listing editor, publishing listings to eBay via the
Sell APIs, and order polling with push notifications for sold items.

## Stack

- Expo (React Native) + TypeScript strict mode
- expo-router for navigation
- Supabase (Postgres + Auth) via `@supabase/supabase-js`

## Project layout

```
app/                  expo-router routes
  (auth)/             sign-in / sign-up screens
  (tabs)/             authenticated tab navigator (scan, history, inventory, orders, settings)
  scan/[id]/          scan result screen
  inventory/[id]/     listing draft screen
src/
  contexts/           AuthContext (Supabase session state)
  lib/                Supabase client, scan upload + edge function helper,
                       shared scan display helpers (badges, formatting),
                       inventory + listing draft helpers, orders helpers,
                       push notification registration
  types/              Database row types matching the Supabase schema
supabase/migrations/  SQL schema + storage migrations
supabase/functions/   Edge functions (Deno)
  scan/               Orchestrates identification, comps, and ROI
  ebay-oauth-start/   Builds the eBay consent screen URL (auth required)
  ebay-oauth-callback/ Exchanges the OAuth code for tokens (public, no JWT)
  generate-listing/   Generates an eBay listing title/description with Claude
  publish-listing/    Publishes a listing draft via the eBay Sell APIs
  sync-orders/        Polls eBay for new sales and syncs them into orders/inventory
  _shared/            anthropic.ts (vision), comps.ts (eBay/Apify + cache),
                       roi.ts (ROI math, unit tested), ebayOAuth.ts (Sell API OAuth),
                       listing.ts (listing copy generation), ebaySell.ts /
                       ebayCategory.ts (publish pipeline), ebayFulfillment.ts
                       (order polling), pushNotifications.ts (Expo push API)
```

## Getting started

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create a Supabase project at https://supabase.com, then copy `.env.example`
   to `.env` and fill in your project URL and anon key (Project Settings > API):

   ```sh
   cp .env.example .env
   ```

3. Apply the schema + storage migrations in `supabase/migrations/` via the
   Supabase SQL editor or the Supabase CLI:

   ```sh
   supabase db push
   ```

4. Set Edge Function secrets and deploy the functions:

   ```sh
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   # Optional — see "Registering for eBay developer access" below.
   supabase secrets set EBAY_CLIENT_ID=... EBAY_CLIENT_SECRET=...
   supabase secrets set APIFY_TOKEN=... APIFY_SOLD_LISTINGS_ACTOR_ID=...
   # Required for the "Connect eBay" flow — see "eBay OAuth connect flow" below.
   supabase secrets set EBAY_OAUTH_REDIRECT_URI=... EBAY_OAUTH_STATE_SECRET=...
   # Required to publish listings — see "Publish to eBay" below.
   supabase secrets set EBAY_MERCHANT_LOCATION_KEY=... EBAY_FULFILLMENT_POLICY_ID=... \
     EBAY_PAYMENT_POLICY_ID=... EBAY_RETURN_POLICY_ID=...
   supabase functions deploy scan
   supabase functions deploy ebay-oauth-start
   supabase functions deploy ebay-oauth-callback
   supabase functions deploy generate-listing
   supabase functions deploy publish-listing
   supabase functions deploy sync-orders
   ```

5. Start the app:

   ```sh
   npm run start   # or: npm run ios / npm run android / npm run web
   ```

Email/password sign-up creates a Supabase auth user; a `profiles` row is
created automatically via a database trigger.

## Scan flow (step 3)

1. The Scan tab opens the camera (`app/(tabs)/index.tsx`). Capture a photo,
   then tap "Use Photo".
2. The photo is uploaded to the private `scan-images` Storage bucket under
   `${user_id}/...` (RLS-scoped per user).
3. The app calls the `/scan` Edge Function with the storage path. The
   function downloads the image, sends it to Claude vision using the prompt
   from spec section 7, validates the JSON response with Zod, inserts a row
   into `scans`, and increments `profiles.scans_this_month`.
4. The app navigates to `/scan/[id]`, which shows the identified item, brand/
   model/part number, condition, notable flaws, and ID confidence. A
   low-confidence banner prompts the user to retake the photo.

Free-tier users are capped at 10 scans/month, enforced server-side in the
edge function. The preview screen also has an optional "asking price" field —
if set, it's sent along with the scan and used to compute ROI %, net profit,
and the buy/maybe/skip recommendation.

## Comps + ROI pipeline (step 4)

After identification, `/scan` calls `getComps()` (`supabase/functions/_shared/comps.ts`):

1. Checks `comps_cache` for a fresh (< 24h) entry for the normalized search query.
2. If stale/missing, fetches sold comps via an Apify eBay sold-listings actor
   (`APIFY_TOKEN` / `APIFY_SOLD_LISTINGS_ACTOR_ID`) and active listing count via
   the eBay Browse API (`EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET`), then caches
   the comps.
3. If neither is configured, comps are empty and the scan gets confidence
   grade `D` ("insufficient data") with null pricing — the app still works,
   just without pricing until eBay/Apify credentials are added.

`computeRoi()` (`supabase/functions/_shared/roi.ts`) implements spec section 6:
filters comps by condition class, removes outliers with a 1.5×IQR fence,
computes the median sale price, eBay fees, a category-based shipping
estimate, the A–D confidence grade, `max_buy_price` ("buy if under $X"), and
— when an asking price is provided — ROI %, net profit, and a buy/maybe/skip
recommendation. This module is pure TypeScript with unit tests:

```sh
npm test
```

## Environment variables

| Variable | Where used | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | App | Public, safe to bundle |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | App | Public, safe to bundle (RLS enforced) |
| `ANTHROPIC_API_KEY` | Supabase Edge Functions only | Used by the `/scan` function for Claude vision item ID. Never put this in the app. |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | Supabase Edge Functions only | eBay Browse API (active listing counts) / Sell API credentials |
| `APIFY_TOKEN` / `APIFY_SOLD_LISTINGS_ACTOR_ID` | Supabase Edge Functions only | Fallback sold-comps scraper used by `/scan` |
| `EBAY_ENV` | Supabase Edge Functions only | `sandbox` (default) or `production` — selects the eBay OAuth/API base URLs |
| `EBAY_OAUTH_REDIRECT_URI` | Supabase Edge Functions only | eBay "Your auth accepted URL" (RuName) — must point at the deployed `ebay-oauth-callback` function URL |
| `EBAY_OAUTH_STATE_SECRET` | Supabase Edge Functions only | Random secret used to sign the OAuth `state` parameter (e.g. `openssl rand -hex 32`) |

### Registering for the Anthropic API key

1. Go to https://console.anthropic.com and sign in (or create an account).
2. Open **API Keys** and create a new key.
3. Store it as a Supabase Edge Function secret (`supabase secrets set ANTHROPIC_API_KEY=...`)
   — do **not** add it to `.env` in this app, since `EXPO_PUBLIC_*` vars are
   bundled into the client.

### Registering for eBay developer access

1. Go to https://developer.ebay.com and create a developer account.
2. Create an application keyset (sandbox first) to get a Client ID / Client
   Secret for the **Browse API**.
3. Apply for **Marketplace Insights API** access early — approval can take
   time. Until approved, sold comps fall back to an Apify scraper
   (`APIFY_TOKEN`).
4. For Phase 2/3 selling features, enable the **Sell APIs** (Inventory,
   Fulfillment) and configure the OAuth redirect URI for the app — see "eBay
   OAuth connect flow" below.
5. Store all eBay credentials as Supabase Edge Function secrets, never in the
   mobile app bundle.

## Scan history / watchlist (step 5)

The History tab (`app/(tabs)/history.tsx`) lists the signed-in user's scans,
newest first, with filter chips for All / Buy / Maybe / Skip (based on
`scans.recommendation`). Each row shows a thumbnail (signed Storage URL),
item name/category, confidence grade, recommendation badge, estimated sale
price, and a relative timestamp. Pull-to-refresh re-fetches the list; tapping
a row opens `/scan/[id]`.

## Inventory flow (step 6)

On the scan result screen (`app/scan/[id].tsx`), an "I Bought It" button
reveals a purchase-price field (pre-filled from `max_buy_price` when
available); submitting it inserts a row into `inventory` linking the scan to
the signed-in user. If the scan is already in inventory, the screen shows the
purchase price instead of the button.

The Inventory tab (`app/(tabs)/inventory.tsx`) lists the user's inventory,
newest first, joined with the originating scan for a thumbnail, item name,
category, purchase price, and status badge (unlisted/listed/sold/shipped).
Tapping a row opens `/inventory/[id]` (the listing draft screen, step 8).

## eBay OAuth connect flow (step 7)

The Settings tab (`app/(tabs)/settings.tsx`) shows a "Connect eBay" button
when `profiles.ebay_connected` is false:

1. The app calls the `ebay-oauth-start` Edge Function (authenticated), which
   returns an eBay consent screen URL with a signed, short-lived `state`
   token binding the flow to the signed-in user.
2. The app opens that URL via `expo-web-browser`'s `openAuthSessionAsync`,
   with `flipscanner://ebay-callback` as the return URL.
3. After the user grants access, eBay redirects to the public
   `ebay-oauth-callback` Edge Function (`EBAY_OAUTH_REDIRECT_URI`, configured
   as the app's "Your auth accepted URL" / RuName in the eBay developer
   portal). It verifies the `state`, exchanges the authorization code for a
   refresh token (`supabase/functions/_shared/ebayOAuth.ts`), stores it on
   `profiles`, sets `ebay_connected = true`, and redirects back to
   `flipscanner://ebay-callback`, which closes the auth session.
4. The app re-checks `profiles.ebay_connected` and shows "✓ Connected".

This flow defaults to the eBay **sandbox** environment (`EBAY_ENV=sandbox`)
with the `sell.inventory`, `sell.account`, and `sell.fulfillment` scopes,
needed for the draft-listing and order-sync steps that follow.

## Draft listing generator (step 8)

The listing draft screen (`app/inventory/[id].tsx`, opened from the
Inventory tab) lets the user prepare an eBay listing for a purchased item:

1. "Generate Draft with AI" calls the `generate-listing` Edge Function, which
   loads the item's scan identification (name, category, brand, model, part
   number, condition, notable flaws) and asks Claude
   (`supabase/functions/_shared/listing.ts`) for an eBay-style title (≤80
   chars) and an honest description, then saves them to
   `inventory.listing_title` / `inventory.listing_description`.
2. The title, description, and a listing price (pre-filled from the scan's
   estimated sale price) are editable inline. "Save Draft" persists edits —
   including a manually-typed title/description — directly to the
   `inventory` row.
3. The Inventory tab shows a "Draft ready" indicator on items that have a
   saved `listing_title`.

This step only prepares the draft; publishing it to eBay (creating the
inventory item, offer, and listing via the Sell APIs) is step 9.

## Publish to eBay (step 9)

Once a draft has a title, description, and listing price, the listing draft
screen shows a "Publish to eBay" button (for items with `status = 'unlisted'`).
This calls the `publish-listing` Edge Function, which:

1. Confirms the user has connected eBay (`profiles.ebay_connected` +
   `ebay_refresh_token`) and exchanges the refresh token for a user access
   token (`supabase/functions/_shared/ebaySell.ts`).
2. Creates a signed URL for the scan's photo (eBay requires a publicly
   reachable image URL) and looks up an eBay category id for the item via the
   Taxonomy API (`supabase/functions/_shared/ebayCategory.ts`), falling back
   to `EBAY_DEFAULT_CATEGORY_ID` if configured.
3. Runs the Sell Inventory API pipeline: create/replace the inventory item
   (title, description, image, condition), create a fixed-price offer using
   the seller's business policies, then publish the offer.
4. On success, sets `inventory.status = 'listed'` and stores
   `ebay_offer_id` / `ebay_listing_id`; the draft screen shows "✓ Listed on
   eBay (#listingId)".

Creating an offer requires the seller account to have business policies
configured in Seller Hub (or the eBay sandbox equivalent) — their ids are
passed via `EBAY_MERCHANT_LOCATION_KEY`, `EBAY_FULFILLMENT_POLICY_ID`,
`EBAY_PAYMENT_POLICY_ID`, and `EBAY_RETURN_POLICY_ID`. Without these set,
publishing fails with a clear configuration error rather than a partial
listing.

## Order polling + push notifications (step 10)

The Orders tab (`app/(tabs)/orders.tsx`) lists the user's `orders`, newest
first, with the sold item's thumbnail/name, buyer username, sale price, ship-
by date, and a status badge (awaiting shipment/shipped/delivered/cancelled).

Pull-to-refresh calls the `sync-orders` Edge Function, which:

1. Exchanges the stored eBay refresh token for an access token (skipping
   silently if eBay isn't connected).
2. Calls the Fulfillment API for unfulfilled orders and matches each line
   item's SKU back to a `listed` inventory row (SKUs are the inventory row
   id, set when publishing in step 9).
3. For each newly-matched sale, inserts an `orders` row
   (`status = 'awaiting_shipment'`, buyer username, ship-by date) and updates
   the inventory row to `status = 'sold'` with `sold_price` / `sold_at`.
4. If any new sales were found and the user has a registered push token,
   sends an "Item sold!" notification via the Expo push API
   (`supabase/functions/_shared/pushNotifications.ts`).

On sign-in, `app/(tabs)/_layout.tsx` calls
`registerForPushNotifications()` (`src/lib/notifications.ts`), which requests
notification permission, gets an Expo push token via `expo-notifications`,
and stores it on `profiles.push_token`. This is a no-op on web or in
environments without a configured push project.

In production, `sync-orders` should also be invoked periodically (e.g. via
`pg_cron` + `pg_net`, or an external scheduler) for each connected user so
sold notifications arrive without the user opening the app.

## Next steps (Build Order)

See the FlipScanner spec for the full plan. Step 11 (dashboard) is next.
