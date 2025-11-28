// app/api/payments/paytr/webhook/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { verifyPaytrWebhook } from "@/lib/payments/paytr";
import { sendPaymentReceiptEmail } from "@/lib/emails/receipt";
import { notifyWorkerOnAssignment } from "@/lib/mailer/notifyWorkerOnAssignment";
import { createHmac } from "crypto";

export const runtime = "nodejs";

/* ----------------------------- helpers ----------------------------- */
const s = (v: FormDataEntryValue | null) => (v == null ? "" : typeof v === "string" ? v : "");
const parseKurus = (x: string) => {
  const n = parseInt(x || "0", 10);
  return Number.isFinite(n) ? n : 0;
};
const normalizeCurrency = (c?: string | null) => {
  const v = (c || "").toUpperCase();
  if (v === "TL") return "TRY";
  if (["TRY", "USD", "EUR"].includes(v)) return v;
  return v || "TRY";
};
const computeHash = (oid: string, status: string, total: string, key: string, salt: string) =>
  createHmac("sha256", key).update(oid + salt + status + total, "utf8").digest("base64");
const hyphenateUuidIfPossible = (x: string) =>
  /^[a-f0-9]{32}$/i.test(x)
    ? `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
    : null;

function getClientInfo(req: Request) {
  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "";
  const user_agent = req.headers.get("user-agent") || "";
  return { ip, user_agent };
}

/** AUDIT: şemaya birebir uygun */
async function audit(action: string, payload: any, ctx?: { order?: any; req?: Request; event?: string }) {
  const { order, req, event } = ctx || {};
  const { ip, user_agent } = req ? getClientInfo(req) : { ip: null, user_agent: null };
  try {
    const row: any = {
      action,
      event: event || action,
      resource_type: "payment",                      // NOT NULL
      resource_id: order?.id ?? null,
      payload,
      tenant_id: order?.tenant_id ?? null,
      user_id: order?.user_id ?? null,
      question_id: order?.question_id ?? null,
      actor_role: "system",
            actor_id: null,
      actor_user_id: null,
      entity_type: "order",
      entity_id: order?.id ?? null,
      ip,
      user_agent,
      metadata: null,
    };
    const { error } = await supabaseAdmin.from("audit_logs").insert(row);
    if (error) console.error("[audit.insert.error]", action, error);
  } catch (e: any) {
    
  }
}

/** NOTIFY: notification_logs şemasına uygun (channel vb. yok) */
async function notify(event: string, payload: any, ctx?: { order?: any; to_email?: string; subject?: string; template?: string; provider?: string; provider_id?: string | null; status?: string; error?: string | null }) {
  try {
    const { order, to_email, subject, template, provider, provider_id, status, error } = ctx || {};
    const row: any = {
      tenant_id: order?.tenant_id ?? null,
      event,
      to_email: to_email ?? null,
      subject: subject ?? null,
      template: template ?? null,
      provider: provider ?? (to_email ? "resend" : "system"),
      provider_id: provider_id ?? null,
      status: status ?? (to_email ? "sent" : "ok"),
      error: error ?? null,
      payload,
      entity_type: "order",
      entity_id: order?.id ?? null,
    };
    const { error: e } = await supabaseAdmin.from("notification_logs").insert(row);
    if (e) console.error("[notify.insert.error]", event, e);
  } catch (e: any) {
    
  }
}

/** PAYMENTS insert: row_payload varsa yaz, yoksa payload’sız fallback */
async function insertPaymentRow(order: any, data: {
  provider_ref: string;
  amount_cents: number;
  currency: string;
  status: "paid" | "failed";
  payload?: any;
}) {
  // 1) row_payload ile dene
  try {
    const { error } = await supabaseAdmin.from("payments").insert({
      order_id: order.id,
      question_id: order.question_id ?? null,
      tenant_id: order.tenant_id ?? null,
      provider: "paytr",
      provider_ref: data.provider_ref,
      amount_cents: data.amount_cents,
      currency: data.currency,
      status: data.status,
      row_payload: data.payload ?? null,
    } as any);
    if (!error) return true;
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("row_payload")) throw error; // cache/kolon yok → fallback
    throw error;
  } catch {
    // 2) payload’sız fallback
    const { error: e2 } = await supabaseAdmin.from("payments").insert({
      order_id: order.id,
      question_id: order.question_id ?? null,
      tenant_id: order.tenant_id ?? null,
      provider: "paytr",
      provider_ref: data.provider_ref,
      amount_cents: data.amount_cents,
      currency: data.currency,
      status: data.status,
    } as any);
    if (e2) {
      
      return false;
    }
    return true;
  }
}

/* ----------------------------- handler ----------------------------- */
export async function POST(req: Request) {
  const clientInfo = getClientInfo(req);

  try {
    // 1) Payload
    const form = await req.formData();
    const merchant_oid = s(form.get("merchant_oid"));
    const status = s(form.get("status")).toLowerCase(); // success/failed/canceled/...
    const total_amount = s(form.get("total_amount"));   // kuruş
    const payment_amount = s(form.get("payment_amount"));
    const currency_in = s(form.get("currency"));        // TL vb.
    const received_hash = s(form.get("hash"));
    const merchant_id = s(form.get("merchant_id"));
    const installment_count = s(form.get("installment_count"));
    const payment_type = s(form.get("payment_type"));
    const test_mode = s(form.get("test_mode"));

    if (!merchant_oid || !status || !total_amount || !received_hash) {
      await audit("paytr.webhook.invalid_payload", { merchant_oid, status, total_amount_present: !!total_amount, hash_present: !!received_hash, ...clientInfo });
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    // 2) İmza
    const KEY = process.env.PAYTR_MERCHANT_KEY || "";
    const SALT = process.env.PAYTR_MERCHANT_SALT || "";
    const computed_hash = computeHash(merchant_oid, status, total_amount, KEY, SALT);

    let libVerified: boolean | undefined = undefined;
    try {
      const anyFn = verifyPaytrWebhook as any;
      if (typeof anyFn === "function") libVerified = !!anyFn({ merchant_oid, status, total_amount, hash: received_hash });
    } catch {}

    if (received_hash !== computed_hash) {
      await audit("paytr.webhook.signature_invalid", { merchant_oid, status, total_amount, received_hash_tail: received_hash.slice(-8), computed_hash_tail: computed_hash.slice(-8), libVerified, ...clientInfo });
      return NextResponse.json({ ok: false, error: "signature_invalid" }, { status: 400 });
    }

    // 3) Order
    let orderSel = await supabaseAdmin
      .from("orders")
      .select("id, status, amount_cents, amount, currency, user_id, question_id, tenant_id, provider, provider_ref")
      .eq("provider", "paytr")
      .eq("provider_ref", merchant_oid)
      .maybeSingle();

    if (orderSel.error && orderSel.error.code !== "PGRST116") {
      await audit("paytr.webhook.select_error", { merchant_oid, error: orderSel.error, ...clientInfo });
      return NextResponse.json({ ok: false, error: "order_select_failed" }, { status: 500 });
    }

    if (!orderSel.data) {
      const uuid = hyphenateUuidIfPossible(merchant_oid);
      if (uuid) {
        orderSel = await supabaseAdmin
          .from("orders")
          .select("id, status, amount_cents, amount, currency, user_id, question_id, tenant_id, provider, provider_ref")
          .eq("id", uuid)
          .maybeSingle();
      }
    }

    const order = orderSel.data || null;
    if (!order) {
     // Bizde karşılığı olmayan / daha önce silinmiş siparişler için
     // ekstra log üretmeden ve PayTR'ın tekrar denemesini tetiklemeden
     // sessizce 200 OK dön.
     return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
 }

    // 4) Tutar uyarlaması
    const posted = parseKurus(total_amount);
    let expected =
      (typeof order.amount_cents === "number" && order.amount_cents > 0 && order.amount_cents) ||
      (typeof order.amount === "number" && order.amount > 0 && order.amount) ||
      null;

    let currency = normalizeCurrency(order.currency || currency_in || "TRY");

    // Order pending & tutar boş → posted'ı order’a yaz (idempotent)
    if ((expected == null || expected === 0) && order.status === "pending") {
      const { error: upNil } = await supabaseAdmin
        .from("orders")
        .update({ amount_cents: posted, currency, provider: "paytr", provider_ref: merchant_oid })
        .eq("id", order.id)
        .eq("status", "pending");
      if (upNil) {
        await audit("paytr.webhook.amount_autofill_failed", { order_id: order.id, posted, currency, err: upNil, ...clientInfo }, { order, req });
        return NextResponse.json({ ok: false, error: "amount_update_failed" }, { status: 500 });
      }
      expected = posted;
    }

    // Son kontrol (±1 kuruş tolerans)
    const okAmount = expected != null && (expected === posted || Math.abs(expected - posted) <= 1);
    if (!okAmount) {
      await audit(
        "paytr.webhook.amount_mismatch",
        { order_id: order.id, merchant_oid, order_amount_cents: expected, posted_total_amount: posted, payment_amount: parseKurus(payment_amount || ""), currency, ...clientInfo },
        { order, req }
      );
      return NextResponse.json({ ok: false, error: "amount_mismatch" }, { status: 400 });
    }

    // 5) Akış
    if (status === "success") {
      // idempotent
      if (order.status === "paid") {
        await audit("paytr.webhook.idempotent", { order_id: order.id, merchant_oid, ...clientInfo }, { order, req });
        return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
      }

      // orders → paid
      const { error: upErr } = await supabaseAdmin
        .from("orders")
        .update({ status: "paid", paid_at: new Date().toISOString(), provider: "paytr", provider_ref: merchant_oid })
        .eq("id", order.id)
        .eq("status", "pending");
      if (upErr) {
        await audit("paytr.webhook.order_update_failed", { order_id: order.id, err: upErr, ...clientInfo }, { order, req });
        return NextResponse.json({ ok: false, error: "order_update_failed" }, { status: 500 });
      }

      // payments → insert
      const okPay = await insertPaymentRow(order, {
        provider_ref: merchant_oid,
        amount_cents: posted,
        currency,
        status: "paid",
        payload: { merchant_id, installment_count, payment_type, test_mode },
      });
      if (!okPay) {
        await audit("paytr.webhook.payment_insert_failed", { order_id: order.id, amount_cents: posted, currency, ...clientInfo }, { order, req });
      }

// Question status → approved (only if this order is linked to a question and current status is 'submitted')
try {
  if (order.question_id) {
    const { error: qErr } = await supabaseAdmin
      .from("questions")
      .update({ status: "approved" })
      .eq("id", order.question_id)
      .eq("status", "submitted");
    if (qErr) {
      await audit("paytr.webhook.question_status_update_failed", { order_id: order.id, question_id: order.question_id, err: qErr, ...clientInfo }, { order, req });
    } else {
      await audit("paytr.webhook.question_status_updated", { order_id: order.id, question_id: order.question_id, new_status: "approved", ...clientInfo }, { order, req });
    }
  }
} catch (e: any) {
  await audit("paytr.webhook.question_status_update_crash", { order_id: order.id, question_id: order.question_id || null, err: String(e?.message || e), ...clientInfo }, { order, req });
}
// G360: Worker assignment mail (post-paid, deterministic)
if (order.question_id) {
  try {
    await notifyWorkerOnAssignment({
      questionId: order.question_id,
      method: "Paytr",
      amountCents: posted,                // TL * 100 (üstte hesaplanan 'posted')
      creditAmount: 0,
      tenantId: order.tenant_id ?? null,
    });
  } catch (e) {
    // mail hatası ödeme akışını etkilemesin
    await audit(
      "worker.mail.failed",
      { order_id: order.id, err: String((e as any)?.message || e) },
      { order, req }
    );
  }
}
 // ---------- Tenant bazlı receipt locale & base URL ----------
  // Varsayılan: TR
  let receiptLocale: "tr" | "en" = "tr";
 let dashboardBaseUrl =
   process.env.APP_BASE_URL_TR ||
    (process.env.APP_PRIMARY_DOMAIN ? `https://${process.env.APP_PRIMARY_DOMAIN}` : "http://localhost:3000");
 
  if (order.tenant_id) {
    const { data: ten } = await supabaseAdmin
      .from("tenants")
      .select("primary_domain, default_lang")
      .eq("id", order.tenant_id)
       .maybeSingle();

   if (ten) {
       const rawLocale = String(ten.default_lang || "").trim().toLowerCase().replace("_", "-");
     // "en-US" / "en_us" → en, diğer her şey → tr
    receiptLocale = rawLocale.startsWith("en") ? "en" : "tr";

     if (ten.primary_domain) {
        const dom = String(ten.primary_domain).trim();
      const isLocal = dom.includes("localhost") || dom.includes("127.0.0.1");
       const proto = isLocal ? "http" : "https";
       dashboardBaseUrl = `${proto}://${dom}`;
      } else if (receiptLocale === "en") {
        // EN tenant ama primary_domain boşsa EN base URL’ye düş
        dashboardBaseUrl = process.env.APP_BASE_URL_EN || dashboardBaseUrl;
     }
    }
   } else if (currency === "USD") {
    // Tenant yoksa kaba fallback: USD ödemeleri EN kabul et
    receiptLocale = "en";
   dashboardBaseUrl = process.env.APP_BASE_URL_EN || dashboardBaseUrl;
   }
  // --------------------------------------------------------------
      // E-postalar
      try {
        // Kullanıcı
        let toUser = "";
        if (order.user_id) {
          const pr = await supabaseAdmin.from("profiles").select("email").eq("id", order.user_id).maybeSingle();
          if (!pr.error && pr.data?.email) toUser = pr.data.email;
        }
        if (toUser) {
             await sendPaymentReceiptEmail({
            to: toUser,
          amount: posted,
          currency,
           orderId: order.id,
          questionId: order.question_id || undefined,
           paymentProvider: "PayTR",
             dashboardBaseUrl,
            locale: receiptLocale,
          });
          await audit("email.receipt.sent", { order_id: order.id, to: toUser, amount_cents: posted, currency, ...clientInfo }, { order, req });
          await notify("payment.receipt.sent", { order_id: order.id, to: toUser, amount_cents: posted, currency }, { order, to_email: toUser, subject: "Ödeme Makbuzu", template: "payment_receipt", provider: "resend", status: "sent" });
        } else {
          await audit("email.receipt.skipped_no_to", { order_id: order.id, ...clientInfo }, { order, req });
          await notify("payment.receipt.skipped", { order_id: order.id }, { order, status: "skipped" });
        }

        // Admin(ler)
        const adminList = (process.env.PAYMENT_ADMIN_EMAILS || "")
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean);
        for (const adminTo of adminList) {
          try {
                   await sendPaymentReceiptEmail({
            to: adminTo,
             amount: posted,
              currency,
               orderId: order.id,
              questionId: order.question_id || undefined,
               paymentProvider: "PayTR",
              dashboardBaseUrl,
              locale: receiptLocale,
            });

            await notify("payment.receipt.admin.sent", { order_id: order.id, to: adminTo }, { order, to_email: adminTo, subject: "Yeni Ödeme", template: "payment_receipt_admin", provider: "resend", status: "sent" });
          } catch (e: any) {
            await audit("email.receipt.admin.failed", { order_id: order.id, to: adminTo, err: String(e?.message || e), ...clientInfo }, { order, req });
            await notify("payment.receipt.admin.failed", { order_id: order.id, to: adminTo, error: String(e?.message || e) }, { order, to_email: adminTo, provider: "resend", status: "error", error: String(e?.message || e) });
          }
        }
      } catch (e: any) {
        await audit("email.flow.error", { order_id: order.id, err: String(e?.message || e), ...clientInfo }, { order, req });
      }

      await audit("paytr.webhook.paid", { order_id: order.id, merchant_oid, total_amount_cents: posted, currency, ...clientInfo }, { order, req });
      return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
    } else {
      // failed/canceled
      if (order.status !== "paid") {
        const { error: upErr } = await supabaseAdmin
          .from("orders")
          .update({ status: "failed", provider: "paytr", provider_ref: merchant_oid })
          .eq("id", order.id)
          .neq("status", "paid");
        if (upErr) {
          await audit("paytr.webhook.order_fail_update_failed", { order_id: order.id, err: upErr, ...clientInfo }, { order, req });
          return NextResponse.json({ ok: false, error: "order_update_failed" }, { status: 500 });
        }
      }

      // payments → failed kaydı (isteğe bağlı ama faydalı)
      await insertPaymentRow(order, {
        provider_ref: merchant_oid,
        amount_cents: posted,
        currency,
        status: "failed",
        payload: { merchant_id, installment_count, payment_type, test_mode },
      });

      await audit("paytr.webhook.failed", { order_id: order.id, merchant_oid, total_amount_cents: posted, ...clientInfo }, { order, req });
      return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
  } catch (e: any) {
    const msg = String(e?.message || e);
   
    await audit("paytr.webhook.crash", { error: msg }, undefined);
    return NextResponse.json({ ok: false, error: "webhook_crashed", detail: msg }, { status: 500 });
  }
}


