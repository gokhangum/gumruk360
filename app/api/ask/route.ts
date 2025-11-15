// app/api/ask/route.ts
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

export async function GET() {
  const { data, error } = await supabase
    .from("questions")
    .select("id,title,description,status,created_at")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const title = String(body?.title || "").trim()
  const description = String(body?.description || "")

  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 })

  const { data, error } = await supabase
    .from("questions")
    .insert([{ title, description, status: "submitted" }])
    .select("id,title,description,status,created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
