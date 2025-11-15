import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await supabaseServer();
  // Not enforcing auth here; both admin & worker forms can read base rate.
  const { data, error } = await supabase
    .from("pricing_versions")
    .select("base_hourly_rate")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, base_hourly_rate: data?.base_hourly_rate ?? 0 });
}
