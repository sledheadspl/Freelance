# FireReady — Phase 1 MVP

Wildfire preparedness and family safety app. React Native (Expo managed workflow) +
TypeScript + Expo Router on the front, Supabase (Postgres + Auth + Row Level
Security + Realtime) on the back.

**Phase 1 features:** email auth, family groups with invite codes, shared
preparedness checklist, GPS check-ins (Safe / Evacuating / Needs Help), live family
map, push notifications on status changes, basic evacuation routing, and an alerts
screen running on sample data.

---

## 1. Accounts & API keys you need to create

| What | Where | Needed for |
|---|---|---|
| Supabase project (free tier is fine) | [supabase.com/dashboard](https://supabase.com/dashboard) | Everything — auth, database, realtime |
| Expo account + EAS project | `npx eas init` (free) | Remote push notifications |
| Google Maps Android API key | [Google Cloud Console](https://console.cloud.google.com) → enable **Maps SDK for Android** | The map on Android dev/production builds only |

No key is needed for: iOS maps (Apple Maps), routing (public OSRM demo server —
replace before launch, see `src/lib/routing.ts`), or alerts (mock data for now).

## 2. Set up Supabase

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard)
   (pick a strong database password; region close to your users).
2. Open **SQL Editor → New query**, paste the entire contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and click **Run**. This creates
   all tables, Row Level Security policies, the invite-code RPCs, the
   profile-on-signup trigger, the check-in history trigger, and enables realtime
   on `checkin_status`.
3. Go to **Settings → API** and copy the **Project URL** and the **anon public**
   key into `.env` (next section).
4. Auth is preconfigured for email/password. By default Supabase requires email
   confirmation; while developing you can turn it off under
   **Authentication → Providers → Email → Confirm email** so sign-ups log in
   immediately.

The schema file is safe to re-run — it drops and recreates the FireReady tables
(which wipes their data), so it doubles as a reset button during development.

### How the security model works

Row Level Security is the only thing standing between users, since the anon key
ships in the app. The rules, enforced in Postgres regardless of what the client
sends:

- You can read profiles, check-ins, history, and checklist items **only for your
  own family** (`is_family_member()` helper).
- You can only write **your own** profile and check-in rows; checklist items are
  writable by any family member.
- Creating and joining families goes through the `create_family` /
  `join_family_with_code` RPCs so invite codes can be looked up without exposing
  the families table to non-members.
- `checkin_history` is append-only via trigger — clients can't insert or edit it.

## 3. Configure and run the app

```bash
cd fireready
npm install
cp .env.example .env   # then fill in your Supabase URL + anon key
npx expo start
```

Scan the QR code with the Expo Go app (iOS/Android) or press `i` / `a` for a
simulator. Sign up two accounts (or use two devices) to see the family flow work
end-to-end.

**Expo Go limitations to know about:**

- **Remote push notifications don't work in Expo Go on Android.** Check-ins and
  everything else still work; only the push delivery is skipped. To test push,
  create a development build: `npx eas init` (sets your `EAS_PROJECT_ID`), then
  `npx eas build --profile development --platform android`, and run on a
  physical device.
- **Maps** work in Expo Go on both platforms. Your own Google Maps key
  (`GOOGLE_MAPS_ANDROID_API_KEY` in `.env`) is only used when you make your own
  Android build.
- Location and push both need a **physical device** to behave realistically.

## 4. Project structure

```
fireready/
├── app.config.ts          # Expo config (reads keys from .env)
├── supabase/
│   └── schema.sql         # Full DB schema + RLS — run in Supabase SQL editor
└── src/
    ├── app/               # Expo Router file-based routes
    │   ├── _layout.tsx    #   root: session bootstrap + splash gate
    │   ├── (auth)/        #   sign-in / sign-up (redirects into app if logged in)
    │   └── (app)/         #   tab navigator (redirects to sign-in if logged out)
    │       ├── index.tsx  #     Check In — status buttons + GPS capture
    │       ├── map.tsx    #     Family map with live status pins
    │       ├── checklist.tsx #  Shared preparedness checklist
    │       ├── alerts.tsx #     Alerts near saved home (mock feed)
    │       ├── family.tsx #     Create / join / invite / roster
    │       ├── profile.tsx#     Name, home address, sign out (hidden from tab bar)
    │       └── route.tsx  #     Evacuation route display (hidden from tab bar)
    ├── components/ui.tsx  # Small shared UI kit (Button, Field, Card, badges…)
    ├── lib/               # Non-UI logic
    │   ├── supabase.ts    #   client singleton (AsyncStorage session persistence)
    │   ├── notifications.ts #  push token registration + best-effort send
    │   ├── location.ts    #   GPS capture + address geocoding
    │   ├── routing.ts     #   OSRM driving directions (swap for Mapbox later)
    │   ├── alerts.ts      #   AlertProvider interface + mock provider
    │   ├── geo.ts         #   haversine, formatting, map region helpers
    │   └── theme.ts       #   colors, spacing, status metadata
    ├── stores/            # Zustand stores (auth, family, checklist, checkin)
    └── types/             # DB row types + app types
```

Conventions: screens stay thin and call into stores; stores own all Supabase
access; `lib/` has no React in it. Forms use React Hook Form + Zod
(see the auth screens for the pattern).

## 5. Where Phase 2+ hooks in

- **Real alert feed** — implement `AlertProvider` in `src/lib/alerts.ts` against
  a live source (e.g. NWS `api.weather.gov/alerts/active?point=lat,lng`) and swap
  the `activeAlertProvider` export. The screen doesn't change.
- **Fire-aware routing** — replace the OSRM URL in `src/lib/routing.ts`; the
  `EvacuationRoute` shape is provider-agnostic.
- **Server-side push** — move the send in `src/lib/notifications.ts` into a
  Supabase Edge Function triggered by a database webhook on `checkin_status`, so
  delivery doesn't depend on the sender's device connectivity.
- **Multiple families per user** — drop the `unique (user_id)` constraint on
  `family_members` and update `familyStore.refresh()`.
