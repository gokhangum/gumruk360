import { NextResponse } from "next/server"
 import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
 import { supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("feature_flags")
    .select("draft_generate_enabled")
    .eq("id", "default")
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: { draftGenerateEnabled: !!(data?.draft_generate_enabled ?? true) } })
}

 export async function POST(req: Request) {
   const body = await req.json().catch(() => ({} as any))
   const enabled = !!body?.enabled
   const supabase = await supabaseServer()
   // (opsiyonel) oturum kontrolü
   const { data: { user } } = await supabase.auth.getUser()
   if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
   // admin_set_* RPC'yi KULLANICI bağlamıyla çağır
   const { error } = await supabase.rpc("admin_set_draft_generate_enabled", { p_enabled: enabled })
   if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 403 })
   return NextResponse.json({ ok: true, data: { draftGenerateEnabled: enabled } })
 }
