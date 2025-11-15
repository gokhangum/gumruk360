// app/api/paddle/webhooks/route.ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import { verifyWebhookSignature } from "@/lib/payments/paddle"
import { sendSystemEmail } from "@/lib/mailer"
import { getTranslations } from "next-intl/server" 
import { notifyWorkerOnAssignment } from "@/lib/mailer/notifyWorkerOnAssignment"
export const runtime = "nodejs"
// Emniyetli audit helper: action ZORUNLU; hatayı swallow eder
async function safeAudit(
  admin: any,
  action: string,
  meta?: Record<string, any> | null
) {
  try {
    await admin.from("audit_logs").insert({
      action,
      actor: "system",
      meta: meta || null,
    });
  } catch (e) {

  }
}

// Raw body gerek; Next 15 Route Handlers text() ile ham gövdeyi verir.
export async function POST(req: Request) {
  const raw = await req.text()
  const sig = req.headers.get("paddle-signature") || req.headers.get("Paddle-Signature") || null

  const ok = verifyWebhookSignature(raw, sig)
  if (!ok) {
    if (process.env.ALLOW_UNVERIFIED_PADDLE_WEBHOOKS === "1") {
      // dev/test override: imzasız kabul
    } else {
      // Admin client'ı çekip audit at, sonra 200 dön ki Paddle retry yağmasın
      const admin = (typeof (supabaseAdmin as any) === "function") ? await (supabaseAdmin as any)() : (supabaseAdmin as any)
      await safeAudit(admin, "paddle_invalid_signature", { sigPresent: !!sig })
      return NextResponse.json({ ok: true })  // 2xx
    }
  }


  let evt: any = null
  try {
    evt = JSON.parse(raw)
  } catch {
    const admin = (typeof (supabaseAdmin as any) === "function") ? await (supabaseAdmin as any)() : (supabaseAdmin as any)
    await safeAudit(admin, "paddle_invalid_json", { snippet: raw?.slice(0, 200) })
    return NextResponse.json({ ok: true }) // 2xx
  }


  const type = String(evt?.event_type || evt?.type || "")
  const data = evt?.data || evt?.event || {}
  const transactionId = data?.id || data?.transaction_id || null
  const status = String(data?.status || evt?.status || "").toLowerCase()
  const currency = (data?.currency || data?.amount?.currency_code || "USD").toUpperCase()
  const amountCents = (() => {
    const val = data?.amount || data?.amount?.amount || null
    if (val == null) return null
    const num = Number(val)
    if (isNaN(num)) return null
    // Eğer "12.34" gelirse *100
    return Math.round(num * 100)
  })()

  // Custom data / order_id
  const custom = data?.custom_data || data?.metadata || {}
  const orderId = String(custom?.order_id || custom?.orderId || "")

  // Sadece başarılı onay olaylarında order/payments güncelle
  const isCompleted =
    status === "completed" ||
    type === "transaction.completed" ||
    type === "payment.succeeded" ||
    type === "payment.completed" ||
	type === "transaction.paid"

  const admin = (typeof (supabaseAdmin as any) === "function") ? await (supabaseAdmin as any)() : (supabaseAdmin as any)

  if (!orderId) {
    await safeAudit(admin, "paddle_webhook_missing_order_id", { type, transactionId, status })
    return NextResponse.json({ ok: true }) // 2xx dön, tekrar denemesin
  }


  if (isCompleted) {
    // idempotency: aynı provider_ref varsa tekrar yazma
    const { data: existing } = await admin
      .from("payments")
      .select("id")
      .eq("provider", "paddle")
      .eq("provider_ref", transactionId)
      .limit(1)
        if (!existing?.length) {
      await admin.from("payments").insert({
        order_id: orderId,
        provider: "paddle",
        provider_ref: transactionId || null,
        status: "paid",                 // CHECK kısıtına uygun
        amount_cents: amountCents ?? 0, // tablo kolonu bu
        currency,
        raw_payload: evt,               // tablo kolonu bu
      })
    }


    // Order → paid
    await admin.from("orders").update({ status: "paid" }).eq("id", orderId)

    // Kredi yükleme: orders.meta.kind === "credit_purchase"
    const { data: ord } = await admin
      .from("orders")
      .select("id, user_id, meta, tenant_id, currency, amount")
      .eq("id", orderId)
      .maybeSingle()

    const kind = ord?.meta?.kind
    const credits = Number(ord?.meta?.credits || 0)
    const scope = String(ord?.meta?.scope_type || "user")

    try {
    if (kind === "credit_purchase" && credits > 0) {
       if (scope === "org" && ord?.meta?.org_id) {
          // organizasyon cüzdanına ekle (projede mevcut helper/SQL akışınız neyse onu çağırın)
           await admin.rpc("fn_add_org_credits", { p_org_id: ord.meta.org_id, p_amount: credits })
        } else {
          await admin.rpc("fn_add_user_credits", { p_user_id: ord?.user_id, p_amount: credits })
         }
     } else if (kind === "question_payment" && ord?.meta?.question_id) {
         // Soru ödemesi başarılı → soruyu tamamlandı işaretle
         const qid = String(ord.meta.question_id)
          await admin
          .from("questions")
           .update({ status: "approved" })
          .eq("id", qid)
        await safeAudit(admin, "question_mark_approved", { orderId, questionId: qid })

         // ✅ Paddle akışında atanan workere mail gönder (PayTR ile aynı mantık)
          // method: "Kredi" (notifyWorkerOnAssignment tipinde Paytr | Kredi var)
         await notifyWorkerOnAssignment({
         questionId: qid,
           method: "Kredi",
           amountCents: (amountCents ?? Math.round(Number(ord?.amount || 0) * 100)),
           creditAmount: 0,
          tenantId: ord?.tenant_id ?? null,
       })
      }


    } catch (e: any) {
      await safeAudit(admin, "paddle_credit_grant_fail", { orderId, credits, scope, detail: String(e?.message || e) })
    }

   // --- Kullanıcıya ödeme onayı e-postası ---
   try {
    // Siparişteki kullanıcı ID'sinden e-postayı al
   const userId = ord?.user_id as string | null
     if (userId) {
      const { data: ures, error: uerr } = await admin.auth.admin.getUserById(userId)
     const to = (ures as any)?.user?.email as string | null
     if (!uerr && to) {
        const amount = (amountCents != null) ? (amountCents / 100).toFixed(2) : null
       // Dil tespiti: sipariş meta'dan lang/locale geliyorsa onu kullan; yoksa 'tr'
       const mailLang = String(ord?.meta?.lang || ord?.meta?.locale || "tr")
     const tt = await getTranslations({ locale: mailLang as any, namespace: "emails.payment" })
        const subject = tt("subject", { orderId })
        const text = [
         tt("greeting"),
         "",
          tt("paidSuccess"),
          tt("orderNoText", { orderId }),
          amount ? tt("amountText", { amount, currency }) : null,
          (credits && credits > 0) ? tt("creditsText", { credits }) : null,
          tt("thanks")
       ].filter(Boolean).join("\n")
        const html = [
        `<p>${tt("greeting")}</p>`,
        `<p>${tt("paidSuccess")}</p>`,
          `<p><strong>${tt("orderNoLabel")}</strong> ${orderId}</p>`,
        amount ? `<p><strong>${tt("amountLabel")}</strong> ${amount} ${currency}</p>` : ``,
       (credits && credits > 0) ? `<p><strong>${tt("creditsLabel")}</strong> ${credits}</p>` : ``,
      `<p>${tt("thanks")}</p>`
       ].join("")
        await sendSystemEmail({
        to, subject, text, html,
       locale: mailLang
      })
     }
   }
  } catch (e: any) {
    await safeAudit(admin, "paddle_user_email_fail", { orderId, transactionId, detail: String(e?.message || e) })
  }


        await safeAudit(admin, "paddle_payment_succeeded", { orderId, transactionId, amountCents, currency })

  } else if (type === "transaction.canceled" || status === "canceled") {
    await admin.from("orders").update({ status: "canceled" }).eq("id", orderId)
    await safeAudit(admin, "paddle_payment_canceled", { orderId, transactionId })

  } else {
    // diğer event'ler için sadece audit
    await safeAudit(admin, "paddle_webhook_info", { type, orderId, transactionId, status })

  }

  return NextResponse.json({ ok: true })
}
