import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET() {
  const sb = await supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data, error } = await sb
    .from("attachments")
    .select("id, original_name, size, content_type, object_path, file_path, created_at, question_id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}
