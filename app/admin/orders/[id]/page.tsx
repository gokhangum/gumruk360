import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth";
import { MAIL, OWNER } from "@/lib/config/appEnv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lc = (v: any) => (v == null ? "" : String(v)).toLowerCase();

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

function fmtMoney(v: number | null | undefined, ccy: string | null | undefined): string {
  if (v == null) return "-";
  const code = (ccy || "TRY").toUpperCase();
  try { return v.toLocaleString("tr-TR", { style: "currency", currency: code }); }
  catch { return `${v.toLocaleString("tr-TR")} ${code}`; }
}

function fallbackAdminEmail(envEmails: string | undefined, authEmail: string | null): string {
   // 1) Auth kullanıcı e-postası varsa onu kullan
   if (authEmail) return authEmail;
   // 2) ENV’den verilen liste (virgüllü) varsa ilkini al
   const fromEnvList = (envEmails || "")
     .split(",")
     .map(s => s.trim())
     .filter(Boolean);
   if (fromEnvList.length) return fromEnvList[0];
   // 3) Config: ADMIN_NOTIFY_EMAILS (ENV) -> ilk eleman
   if (MAIL.adminNotify?.length) return MAIL.adminNotify[0];
   // 4) Config: OWNER e-postası
   if (OWNER.email) return OWNER.email;
   // 5) Hiçbiri yoksa boş dön (link paramı boş olur)
   return ""
}
export default async function AdminOrderDetailPage({ params }: { params: { id: string } }) {
  const p = (await params) || {};
  noStore();

  // Admin doğrulama
  const auth = await supabaseAuth();
  const { data: u } = await auth.auth.getUser();
  const uid = u?.user?.id || null;
  const uemail = u?.user?.email || null;
  if (!uid) redirect("/");

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .maybeSingle();

  const isAdmin = String(prof?.role || "").toLowerCase() === "admin";
  if (!isAdmin) redirect("/");

   const adminEmail = fallbackAdminEmail(
     process.env.ADMIN_NOTIFY_EMAILS || process.env.ADMIN_EMAILS,
     uemail
   );

  const orderId = p.id;

  // Order'ı geniş çek
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) notFound();

  // Tutar (orders + payments fallback)
  let amount = normalizeAmount(
    firstFinite([order.amount_total, order.total, order.amount, order.price, order.amount_minor]),
    order
  );
  const ccy = order.currency || order.currency_code || "TRY";

  if (amount == null || amount === 0) {
    const { data: pays } = await supabaseAdmin
      .from("payments")
      .select("*")
      .or(`order_id.eq.${order.id},id.eq.${order.payment_id || ""}`);
    if (pays && pays.length) {
      let sum = 0;
      for (const p of pays) {
        const ok = lc(p.status) === "paid" || !!p.paid_at || ["success","succeeded","completed","authorized","captured","ok"].includes(lc(p.status));
        if (!ok) continue;
        const raw = firstFinite([p.amount_total, p.total, p.amount_paid, p.amount, p.price, p.amount_minor]);
        const val = normalizeAmount(raw, p);
        if (val != null) sum += val;
      }
      if (sum > 0) amount = Number(sum.toFixed(2));
    }
  }

  const qid = order.question_id;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Sipariş Detayı (Admin)</h1>

      <div className="border rounded p-4 grid gap-3">
        <div><span className="text-gray-500 mr-2">Order ID:</span><span className="font-mono">{order.id}</span></div>
        <div><span className="text-gray-500 mr-2">Durum:</span><span className="font-medium">{order.status || "-"}</span></div>
        <div><span className="text-gray-500 mr-2">Tutar:</span><span className="font-medium">{fmtMoney(amount, ccy)}</span></div>
        <div><span className="text-gray-500 mr-2">Oluşturma:</span><span>{order.created_at ? new Date(order.created_at).toLocaleString("tr-TR") : "-"}</span></div>
        <div><span className="text-gray-500 mr-2">Ödendi:</span><span>{order.paid_at ? new Date(order.paid_at).toLocaleString("tr-TR") : "-"}</span></div>

        <div>
          <span className="text-gray-500 mr-2">Soru ID:</span>
          {qid ? (
            <Link className="underline font-mono" href={`/admin/request/${qid}?email=${encodeURIComponent(adminEmail)}`}>
              {qid}
            </Link>
          ) : (
            <span className="font-mono">—</span>
          )}
        </div>

        <div className="pt-2 flex gap-4">
          <Link className="underline" href="/admin/payments">Ödemeler listesine dön</Link>
          <Link className="underline" href="/admin">Admin Anasayfa</Link>
        </div>
      </div>
    </div>
  );
}
