import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id")

  const sb = await supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 })

  const { data: row, error } = await sb
    .from("attachments")
    .select("id, object_path, file_path, original_name")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const path = (row as any).object_path || (row as any).file_path
  if (!path) return NextResponse.json({ error: "missing_path" }, { status: 500 })

  const admin = supabaseAdmin
  const { data: signed, error: sErr } = await admin.storage.from("attachments").createSignedUrl(path, 60)
  if (sErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "sign_failed", detail: sErr?.message }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl, name: (row as any).original_name })
}
