

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
 const supabase = await supabaseServer();
 const { data: { user }, error } = await supabase.auth.getUser();
  return NextResponse.json({
    ok: true,
    hasUser: !!user,
    userId: user?.id || null,
    authError: error?.message || null,
  });
}
