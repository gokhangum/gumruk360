// app/api/orders/[id]/status/route.ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"

export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const orderId = String(id || "")
    if (!orderId) return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 })

    const admin = (typeof (supabaseAdmin as any) === "function") ? await (supabaseAdmin as any)() : (supabaseAdmin as any)
    const { data, error } = await admin
      .from("orders")
      .select("id, status, meta")
      .eq("id", orderId)
      .maybeSingle()

    if (error) return NextResponse.json({ ok: false, error: "db_error", detail: error.message }, { status: 500 })
    if (!data?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })

    return NextResponse.json({ ok: true, id: data.id, status: data.status, kind: data.meta?.kind ?? null })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "status_failed", detail: String(e?.message || e) }, { status: 500 })
  }
}
