import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hqstbpygfzhtrzxurnpr.supabase.co';
// Publishable key — safe to ship in client code by design. All real data
// access control lives in Postgres RLS policies (see the schema migration),
// not in keeping this value secret.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ykMva3-fLV413e0NtNrCEQ_ZfsfiLi2';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
