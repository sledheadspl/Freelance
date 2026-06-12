# FlipScanner

Mobile-first reseller app: scan items, get real eBay sold-comp pricing and an
ROI-based buy/skip recommendation, then manage inventory and listings.

This repo currently implements **Build Order step 1**: project scaffold
(Expo + TypeScript strict mode), the Supabase database schema, and
Supabase email/password auth wired into a basic navigation shell.

## Stack

- Expo (React Native) + TypeScript strict mode
- expo-router for navigation
- Supabase (Postgres + Auth) via `@supabase/supabase-js`

## Project layout

```
app/                  expo-router routes
  (auth)/             sign-in / sign-up screens
  (tabs)/             authenticated tab navigator (scan, history, settings)
src/
  contexts/           AuthContext (Supabase session state)
  lib/                Supabase client
  types/              Database row types matching the Supabase schema
supabase/migrations/  SQL schema migrations
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

3. Apply the schema migration in `supabase/migrations/0001_init.sql` via the
   Supabase SQL editor or the Supabase CLI:

   ```sh
   supabase db push
   ```

4. Start the app:

   ```sh
   npm run start   # or: npm run ios / npm run android / npm run web
   ```

Email/password sign-up creates a Supabase auth user; a `profiles` row is
created automatically via a database trigger.

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

See the FlipScanner spec for the full plan. Steps 3–5 (camera scan flow,
eBay comps + ROI pipeline, scan history UI) are next.
