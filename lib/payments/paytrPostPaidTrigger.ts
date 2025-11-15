import { createClient } from "@supabase/supabase-js";
import { notifyWorkerOnAssignment } from "@/lib/mailer/notifyWorkerOnAssignment";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

/**
 * Call this with the PayTR orderId AFTER you have already marked DB as paid.
 * It looks up order/payment → question/amount/tenant and sends worker notification.
 * It never throws — errors are logged to notification_logs and swallowed.
 */
export async function triggerPaytrPostPaid(orderId: string) {
  try {
    if (!orderId) return;

    // Prefer orders row
    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, question_id, tenant_id, status, total_amount_cents, amount_cents")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr) throw oErr;

    let questionId = order?.question_id as string | null;
    let tenantId = (order?.tenant_id as string | null) ?? null;
    let amountCents = Number(order?.total_amount_cents ?? order?.amount_cents ?? 0);
    let paidOk = !!order && ["paid", "success", "completed"].includes(String(order.status || ""));

    // If not enough info from orders, fall back to payments
    if (!paidOk || !questionId || !amountCents) {
      const { data: pay, error: pErr } = await supabase
        .from("payments")
        .select("id, question_id, tenant_id, provider, status, amount_cents, order_id")
        .eq("provider", "paytr")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pErr) throw pErr;
      if (pay) {
        if (!paidOk) paidOk = String(pay.status) === "paid";
        if (!questionId) questionId = pay.question_id as string | null;
        if (!tenantId) tenantId = (pay.tenant_id as string | null) ?? null;
        if (!amountCents) amountCents = Number(pay.amount_cents ?? 0);
      }
    }

    // Audit hook run
    await supabase.from("notification_logs").insert({
      event: "worker.assignment.hook",
      status: paidOk ? "ok" : "skipped",
      payload: { orderId, paidOk, questionId, amountCents },
      entity_type: "order",
      entity_id: orderId,
      tenant_id: tenantId ?? null
    });

    if (!paidOk || !questionId) return;

    // Send worker mail
    await notifyWorkerOnAssignment({
      questionId,
      method: "Paytr",
      amountCents,
      creditAmount: 0,
      tenantId
    });
  } catch (e: any) {
    await supabase.from("notification_logs").insert({
      event: "worker.assignment.hook",
      status: "failed",
      error: String(e?.message || e),
      payload: { orderId },
      entity_type: "order",
      entity_id: orderId
    });
  }
}
