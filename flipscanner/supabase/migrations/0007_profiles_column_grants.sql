-- Restrict which profile columns end users can update directly.
--
-- The "Profiles are updatable by owner" RLS policy (0001_init.sql) only
-- restricts *which rows* a user can update (their own), not *which columns*.
-- Combined with Supabase's default table-level UPDATE grant to the
-- `authenticated` role, any signed-in user could update any column on their
-- own profiles row — including self-granting `subscription_tier = 'pro'`,
-- resetting `scans_this_month`, or tampering with eBay/Stripe linkage fields.
--
-- The app only needs to let users update their own push notification token
-- (see src/lib/notifications.ts). Everything else (subscription tier, scan
-- counts, eBay/Stripe ids and tokens) is written by Edge Functions using the
-- service role, which bypasses RLS and column grants entirely.

revoke update on profiles from authenticated;
grant update (push_token) on profiles to authenticated;
