// lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client.
 * - Service Role anahtarı ile kullanılır.
 * - RLS bypass eder: Admin API'leri için idealdir.
 * 
 * Gerekli env:
 *  - NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "Supabase URL bulunamadı. NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_URL .env dosyanıza ekleyin."
  );
}

if (!serviceRoleKey) {
  throw new Error(
    "Service Role anahtarı bulunamadı. SUPABASE_SERVICE_ROLE_KEY değerini .env dosyanıza ekleyin."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export default supabaseAdmin;
