// app/api/ask/[id]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data, error } = await supabase
    .from("questions")
    .select("id,title,description,status,created_at")
    .eq("id", (await params).id)
    .single()

  if ((error as any)?.code === "PGRST116") {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
