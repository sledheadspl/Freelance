-- Atomic scan-limit check + increment to prevent race conditions on the
-- free-tier monthly cap. Returns the new scans_this_month value, or NULL
-- if the limit has been reached (and the caller should reject with 429).

create or replace function increment_scan_count(p_user_id uuid, p_monthly_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  update profiles
  set scans_this_month = scans_this_month + 1
  where id = p_user_id
    and (subscription_tier != 'free' or scans_this_month < p_monthly_limit)
  returning scans_this_month into new_count;

  return new_count; -- NULL if no row was updated (limit reached)
end;
$$;

-- Allow authenticated users to call this function (it validates user_id
-- against the session via the calling edge function's service role check).
grant execute on function increment_scan_count(uuid, int) to service_role;
