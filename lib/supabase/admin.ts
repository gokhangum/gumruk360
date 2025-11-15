import { createClient } from "@supabase/supabase-js";

// Server-side service role client (bypasses RLS & storage policies).
// Requires: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!url) {
  throw new Error("SUPABASE URL missing (NEXT_PUBLIC_SUPABASE_URL).");
}
if (!serviceKey) {
  throw new Error("SUPABASE service role key missing (SUPABASE_SERVICE_ROLE_KEY).");
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
