-- Monthly reset of scans_this_month for all users.
-- This function is called by the reset-monthly-scans edge function,
-- which should be scheduled via Supabase cron or an external scheduler
-- to run on the 1st of each month (e.g. "0 0 1 * *").

create or replace function reset_monthly_scan_counts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set scans_this_month = 0;
end;
$$;

grant execute on function reset_monthly_scan_counts() to service_role;
