import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

async function makeSupabase() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createServerClient(url, key, {
cookies: {
  get: async (name) => (await cookies()).get(name)?.value, // ← SONA VİRGÜL eklendi
  set: async (name, value, options?: CookieOptions) => {
    const c = await cookies();
    c.set(name, value, options as any);
  },
  remove: async (name, options?: CookieOptions) => {
    const c = await cookies();
    c.set(name, "", { ...options, maxAge: 0 });
  }
}
});

}

export async function GET() {
  const supabase = await makeSupabase();
  const { data, error } = await supabase
    .from("pricing_versions")
    .select(
      "id,version_name,is_active,base_hourly_rate,min_price,urgent_multiplier,rounding_step,auto_price_threshold,created_at"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}
