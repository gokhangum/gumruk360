export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

type ProfilesStats = {
  total: number | null;
  user: number | null;
  worker: number | null;
  admin: number | null;
  new7d: number | null;
};
type QuestionsStats = {
  total: number;
  rejected: number;
  sentOnly: number;
  approved: number;
};
type PaymentsStats = { totalAmount: number | null }; // TL
type WorkerRow = {
  id: string;
  name: string;
  assigned: number;
  completed: number;
  earned: number; // TL
};

const lc = (v: any) => (v == null ? "" : String(v)).toLowerCase();
const okStatus = new Set(["paid","success","succeeded","completed","authorized","captured","ok"]);

function firstFinite(arr: any[]): number | null {
  for (const v of arr) {
    const n = Number(v);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return null;
}
function normalizeAmount(raw: number | null | undefined, row: Record<string, any>): number | null {
  if (raw == null) return null;
  const scale = Number(row.currency_scale);
  if (Number.isFinite(scale) && scale > 1) return Number((raw / scale).toFixed(2));
  if (("amount_minor" in row) || ("total_minor" in row) || ("price_minor" in row) || raw >= 100000) {
    return Number((raw / 100).toFixed(2));
  }
  return Number(raw.toFixed(2));
}

export async function GET() {
  try {
    // ---------- 1) Profiles ----------
    let profiles: ProfilesStats = {
      total: null, user: null, worker: null, admin: null, new7d: null
    };
    try {
      const { data: all } = await supabaseAdmin.from("profiles").select("id, role, created_at");
      const now = Date.now(), d7 = 7*24*60*60*1000;
      const rows = all || [];
      profiles.total  = rows.length;
      profiles.user   = rows.filter((r: any) => lc(r.role) === "user").length;
      profiles.worker = rows.filter((r: any) => lc(r.role) === "worker").length;
      profiles.admin  = rows.filter((r: any) => lc(r.role) === "admin").length;
      profiles.new7d  = rows.filter((r: any) => r?.created_at && now - new Date(r.created_at).getTime() <= d7).length;
    } catch {}

    // ---------- 2) Questions ----------
    let questions: any[] = [];
    try {
      const { data } = await supabaseAdmin.from("questions").select("*");
      questions = data || [];
    } catch {}

    const rejectedTokens = new Set(["rejected","reddedildi","refused","declined","cancelled","canceled","iptal"]);
    const sentOnlyTokens = new Set(["sent","gönderildi","gonderildi","submitted","created","new","pending","queued"]);

    const questionsStats: QuestionsStats = {
      total: questions.length,
      rejected: questions.filter((q: any) => rejectedTokens.has(lc(q.status))).length,
      sentOnly: questions.filter((q: any) => sentOnlyTokens.has(lc(q.status))).length,
      approved: questions.filter((q: any) => lc(q.status) === "approved").length,
    };

    // ---------- 3) Toplam Ödemeler (admin/payments mantığıyla) ----------
    // Orders (pending hariç) + ilgili payments → order tutarı = order.amount* benzeri normalize veya payment toplam fallback
    let paymentsTotal = 0;
    try {
      const { data: ordersData } = await supabaseAdmin.from("orders").select("*");
      const orders = (ordersData || []).filter((o: any) => lc(o.status) !== "pending");

      const orderIds = orders.map((o: any) => o.id);
      const paymentIds = orders.map((o: any) => o.payment_id).filter(Boolean);

      let payments: any[] = [];
      if (orderIds.length || paymentIds.length) {
        const [{ data: p1 }, { data: p2 }] = await Promise.all([
          orderIds.length ? supabaseAdmin.from("payments").select("*").in("order_id", orderIds) : Promise.resolve({ data: [] as any[] }),
          paymentIds.length ? supabaseAdmin.from("payments").select("*").in("id", paymentIds) : Promise.resolve({ data: [] as any[] }),
        ]);
        const merged = [...(p1 || []), ...(p2 || [])];
        const seen = new Set<string>();
        payments = merged.filter((p: any) => {
          const key = `${p.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      const paySumByOrder = new Map<string, number>();
      for (const p of payments) {
        const ok = okStatus.has(lc(p.status)) || !!p.paid_at;
        if (!ok) continue;
        const raw = firstFinite([p.amount_total, p.total, p.amount_paid, p.amount, p.price, p.amount_minor]);
        if (raw == null) continue;
        const scaled = normalizeAmount(raw, p);
        if (scaled == null) continue;
        const oid = p.order_id || p.id;
        const prev = paySumByOrder.get(oid) || 0;
        paySumByOrder.set(oid, Number((prev + scaled).toFixed(2)));
      }

      // her order için amount (orders sayfasındaki gibi)
      for (const o of orders) {
        const rawOrder = firstFinite([o.amount_total, o.total, o.amount, o.price, o.amount_minor]);
        let amount = normalizeAmount(rawOrder, o);
        if (amount == null || amount === 0) {
          const paySum = paySumByOrder.get(o.id) ?? (o.payment_id ? paySumByOrder.get(o.payment_id) : undefined);
          if (typeof paySum === "number" && isFinite(paySum) && paySum > 0) amount = paySum;
        }
        if (typeof amount === "number" && isFinite(amount)) {
          paymentsTotal += amount;
        }
      }
    } catch {}

    const payments: PaymentsStats = { totalAmount: Number(paymentsTotal.toFixed(2)) };

    // ---------- 4) Workers — Kazanılan (approved soruların order.amount / 100 toplamı) ----------
    type Acc = { assigned: number; completed: number; earned: number };
    const doneTokens = new Set(["completed","done","finished","sent","delivered","tamamlandı","tamamlandi"]);
    const byWorkerMap = new Map<string, Acc>();

    // assigned & completed sayıları (eski mantık korunuyor)
    for (const q of questions as any[]) {
      const wid = q.assigned_to || q.worker_id;
      if (!wid) continue;
      const acc = byWorkerMap.get(wid) || { assigned: 0, completed: 0, earned: 0 };
      acc.assigned += 1;
      const done = !!q.answer_sent_at || doneTokens.has(lc(q.answer_status)) || doneTokens.has(lc(q.status));
      if (done) acc.completed += 1;
      byWorkerMap.set(wid, acc);
    }

    // approved sorular → orders.amount (kuruş) /100 TL → worker bazında topla
    try {
      const approvedQs = (questions as any[])
        .filter((q) => (q.assigned_to || q.worker_id) && lc(q.status) === "approved");

      const approvedByWorker = new Map<string, string[]>();
      const approvedIds: string[] = [];
      for (const q of approvedQs) {
        const wid = q.assigned_to || q.worker_id;
        if (!wid || !q.id) continue;
        approvedIds.push(q.id);
        const arr = approvedByWorker.get(wid) || [];
        arr.push(q.id);
        approvedByWorker.set(wid, arr);
      }

      if (approvedIds.length) {
        // yalnızca amount (kuruş) kolonunu kullan
        const { data: ords } = await supabaseAdmin
          .from("orders")
          .select("id, question_id, amount")
          .in("question_id", approvedIds);

        const amountByQuestionTL = new Map<string, number>();
        for (const o of ords || []) {
          const qid = (o as any).question_id;
          const cents = Number((o as any).amount) || 0; // kuruş
          const tl = cents / 100;                       // TL
          amountByQuestionTL.set(qid, Number(((amountByQuestionTL.get(qid) || 0) + tl).toFixed(2)));
        }

        for (const [wid, qids] of approvedByWorker.entries()) {
          const add = qids.reduce((s, qid) => s + (amountByQuestionTL.get(qid) || 0), 0);
          const acc = byWorkerMap.get(wid) || { assigned: 0, completed: 0, earned: 0 };
          acc.earned = Number((acc.earned + add).toFixed(2));
          byWorkerMap.set(wid, acc);
        }
      }
    } catch {}

    const workerIds = Array.from(byWorkerMap.keys());

    // display isimleri
    const nameMap = new Map<string, string>();
    try {
      if (workerIds.length) {
        const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", workerIds);
        (profs || []).forEach((p: any) => nameMap.set(p.id, (p.full_name || "").trim()));
      }
    } catch {}
    const emailMap = new Map<string, string>();
    try {
      if (workerIds.length) {
        const { data: users } = await supabaseAdmin.schema("auth").from("users").select("id, email").in("id", workerIds);
        (users || []).forEach((u: any) => emailMap.set(u.id, (u.email || "").trim()));
      }
    } catch {}

    const workerRows: WorkerRow[] = workerIds
      .map((id) => {
        const acc = byWorkerMap.get(id)!;
        const fullName = (nameMap.get(id) || "").trim();
        const email = (emailMap.get(id) || "").trim();
        const display = fullName || email || id;
        return { id, name: display, assigned: acc.assigned, completed: acc.completed, earned: acc.earned };
      })
      .sort((a, b) => b.earned - a.earned || b.completed - a.completed || a.name.localeCompare(b.name));

    const workersSummary = workerRows.reduce(
      (acc, r) => {
        acc.assigned += r.assigned;
        acc.completed += r.completed;
        acc.earned = Number((acc.earned + r.earned).toFixed(2));
        return acc;
      },
      { assigned: 0, completed: 0, earned: 0 }
    );

    const since7d = new Date(Date.now() - 7*24*60*60*1000).toISOString();

    return NextResponse.json({
      ok: true,
      data: {
        profiles,
        questions: questionsStats,
        payments: { totalAmount: Number(paymentsTotal.toFixed(2)) },
        workers: { byWorker: workerRows, summary: workersSummary },
        since7d
      }
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "server_error" }, { status: 500 });
  }
}
