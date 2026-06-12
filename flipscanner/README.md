# FlipScanner

Mobile-first reseller app: scan items, get real eBay sold-comp pricing and an
ROI-based buy/skip recommendation, then manage inventory and listings.

This repo currently implements **Build Order steps 1-3**: project scaffold
(Expo + TypeScript strict mode), the Supabase database schema, Supabase
email/password auth, and the camera scan flow (capture → upload → Claude
vision item identification → results screen).

## Stack

- Expo (React Native) + TypeScript strict mode
- expo-router for navigation
- Supabase (Postgres + Auth) via `@supabase/supabase-js`

## Project layout

```
app/                  expo-router routes
  (auth)/             sign-in / sign-up screens
  (tabs)/             authenticated tab navigator (scan, history, settings)
  scan/[id]/          scan result screen
src/
  contexts/           AuthContext (Supabase session state)
  lib/                Supabase client, scan upload + edge function helper
  types/              Database row types matching the Supabase schema
supabase/migrations/  SQL schema + storage migrations
supabase/functions/   Edge functions (Deno) — /scan: Claude vision item ID
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

4. Set the Claude vision API key as an Edge Function secret and deploy the
   `/scan` function:

   ```sh
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy scan
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
edge function. Pricing/ROI (comps pipeline) is the next build step.

## Environment variables

| Variable | Where used | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | App | Public, safe to bundle |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | App | Public, safe to bundle (RLS enforced) |
| `ANTHROPIC_API_KEY` | Supabase Edge Functions only | Used by the `/scan` function for Claude vision item ID. Never put this in the app. |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | Supabase Edge Functions only | eBay Browse API / Sell API credentials |
| `APIFY_TOKEN` | Supabase Edge Functions only | Fallback sold-comps scraper |

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
   Fulfillment) and configure the OAuth redirect URI for the app.
5. Store all eBay credentials as Supabase Edge Function secrets, never in the
   mobile app bundle.

## Next steps (Build Order)

See the FlipScanner spec for the full plan. Step 4 (eBay comps pipeline +
ROI calculator) and step 5 (scan history / watchlist UI) are next.
