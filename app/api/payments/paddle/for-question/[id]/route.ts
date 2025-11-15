// app/api/payments/paddle/for-question/[id]/route.ts
import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import { createCheckoutViaTransaction, getEnv } from "@/lib/payments/paddle"

export const runtime = "nodejs"

 export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
   try {
    const { id } = await params
     const questionId = String(id || "")
    if (!questionId) {
       return NextResponse.json({ ok: false, error: "missing_question_id" }, { status: 400 })
    }



    // Kimlik ve host/tenant
    const supa = await supabaseServer()
    const { data: { user } } = await supa.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

    // Soruyu (kilit USD fiyatıyla) getir
    const { data: q, error: qErr } = await supa
      .from("questions")
      .select("id, user_id, tenant_id, price_final_usd")
      .eq("id", questionId)
      .maybeSingle()

    if (qErr) {
      return NextResponse.json({ ok: false, error: "question_fetch_failed", detail: qErr.message }, { status: 500 })
    }
    if (!q?.id) {
      return NextResponse.json({ ok: false, error: "question_not_found" }, { status: 404 })
    }
    if (q.user_id && q.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 })
    }

    const amountUsd = Number(q.price_final_usd || 0)
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_amount_usd" }, { status: 400 })
    }

    const amount_cents = Math.round(amountUsd * 100)

    // orders kaydı (kredi akışıyla aynı şema)
    const admin = (typeof (supabaseAdmin as any) === "function") ? await (supabaseAdmin as any)() : (supabaseAdmin as any)
    const meta: any = {
      kind: "question_payment",
      question_id: questionId,
      product_id: process.env.PADDLE_PRODUCT_ID_QUESTION_DYNAMIC || null,
      product_code: "QUESTION_DYNAMIC",
      pricing_model: "gpt_dynamic",
      service: "customs_advisory",
      tenant_mode: "multi",
    }

    const ins = await admin
      .from("orders")
      .insert({
        tenant_id: (q as any)?.tenant_id ?? null,
        user_id: user.id,
        question_id: questionId,
        amount: amount_cents,
        currency: "USD",
        status: "pending",
        provider: "paddle",
        meta,
      })
      .select("id")
      .single()

    if (ins.error || !ins.data?.id) {
      return NextResponse.json({ ok: false, error: "order_insert_failed", detail: ins.error?.message }, { status: 500 })
    }
    const orderId = String(ins.data.id)

    // Paddle Transaction (inline amount)
    const returnUrl = `/checkout/${orderId}/return`
    const cancelUrl = `/checkout/${orderId}/cancel`


    const { transaction_id } = await createCheckoutViaTransaction({
      amountCents: amount_cents,
      currency: "USD",
      orderId,
      email: user.email || undefined,
      returnUrl,
      cancelUrl,
      quantity: 1,
      productName: "On-Demand Customs Consultancy Answer",
      metadata: meta,
    })

    const env = getEnv()
    return NextResponse.json({
      ok: true,
      data: {
        gateway: "paddle",
        mode: "overlay",
        transaction_id,
        order_id: orderId,
        server_env: env.env
      },
      url: `/checkout/${orderId}?provider=paddle&txn=${transaction_id || ""}`,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "for_question_failed", detail: String(e?.message || e) }, { status: 500 })
  }
}
