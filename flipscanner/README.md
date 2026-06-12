# FlipScanner

Mobile-first reseller app: scan items, get real eBay sold-comp pricing and an
ROI-based buy/skip recommendation, then manage inventory and listings.

This repo currently implements **Build Order steps 1-7**: project scaffold
(Expo + TypeScript strict mode), the Supabase database schema, Supabase
email/password auth, the camera scan flow (capture → upload → Claude vision
item identification → results screen), the eBay sold-comps + ROI pipeline
that powers the buy/skip recommendation, a scan history / watchlist UI, the
"I bought it" → inventory flow, and the "Connect eBay" OAuth flow (sandbox).

## Stack

- Expo (React Native) + TypeScript strict mode
- expo-router for navigation
- Supabase (Postgres + Auth) via `@supabase/supabase-js`

## Project layout

```
app/                  expo-router routes
  (auth)/             sign-in / sign-up screens
  (tabs)/             authenticated tab navigator (scan, history, inventory, settings)
  scan/[id]/          scan result screen
src/
  contexts/           AuthContext (Supabase session state)
  lib/                Supabase client, scan upload + edge function helper,
                       shared scan display helpers (badges, formatting),
                       inventory helpers
  types/              Database row types matching the Supabase schema
supabase/migrations/  SQL schema + storage migrations
supabase/functions/   Edge functions (Deno)
  scan/               Orchestrates identification, comps, and ROI
  ebay-oauth-start/   Builds the eBay consent screen URL (auth required)
  ebay-oauth-callback/ Exchanges the OAuth code for tokens (public, no JWT)
  _shared/            anthropic.ts (vision), comps.ts (eBay/Apify + cache),
                       roi.ts (ROI math, unit tested), ebayOAuth.ts (Sell API OAuth)
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
   supabase functions deploy scan
   supabase functions deploy ebay-oauth-start
   supabase functions deploy ebay-oauth-callback
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
Tapping a row opens `/scan/[id]`.

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

## Next steps (Build Order)

See the FlipScanner spec for the full plan. Step 8 (draft listing generator)
is next.
