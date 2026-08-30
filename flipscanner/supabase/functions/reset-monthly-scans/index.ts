// Resets scans_this_month to 0 for all users.
// Schedule this to run on the 1st of each month via Supabase cron:
//   select cron.schedule('reset-monthly-scans', '0 0 1 * *',
//     $$select net.http_post(url := '<SUPABASE_URL>/functions/v1/reset-monthly-scans',
//       headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}')$$);
// Or schedule it from an external cron service.

import { jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabaseClient.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authHeader || !serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getServiceClient();
  const { error } = await client.rpc('reset_monthly_scan_counts');
  if (error) {
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  return jsonResponse({ ok: true, resetAt: new Date().toISOString() }, { status: 200 });
});
