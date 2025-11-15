import { NextResponse } from "next/server"
 import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
 import { supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET() {
  const { data, error } = await supabaseAdmin.rpc("v_worker_draft_permissions_list")
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

 export async function POST(req: Request) {
   const body = await req.json().catch(() => ({} as any))
   const worker_id = String(body?.worker_id || "")
   const override = String(body?.override || "inherit") as "inherit" | "allow" | "deny"
   if (!worker_id) return NextResponse.json({ ok: false, error: "worker_id_required" }, { status: 400 })
   const supabase = await supabaseServer()
   const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
   // admin_set_* RPC'yi KULLANICI bağlamıyla çağır (SQL is_admin() kontrolü yapar)
   const { error } = await supabase.rpc("admin_set_worker_draft_permission", {
     p_worker_id: worker_id,
     p_override: override,
   })
   if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 403 })
   return NextResponse.json({ ok: true })
 }
