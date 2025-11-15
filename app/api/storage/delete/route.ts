import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"

export const runtime = "nodejs"

export async function DELETE(req: NextRequest) {
  const sb = await supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null) as { id?: string } | null
  const id = body?.id
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 })

  const { data: row, error } = await sb
    .from("attachments")
    .select("id, object_path, file_path")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const path = (row as any).object_path || (row as any).file_path
  if (!path) return NextResponse.json({ error: "missing_path" }, { status: 500 })

  const admin = supabaseAdmin

  const { error: stErr } = await admin.storage.from("attachments").remove([path])
  if (stErr) return NextResponse.json({ error: "storage_delete_failed", detail: stErr.message }, { status: 500 })

  const { error: dbErr } = await admin.from("attachments").delete().eq("id", id)
  if (dbErr) return NextResponse.json({ error: "db_delete_failed", detail: dbErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
