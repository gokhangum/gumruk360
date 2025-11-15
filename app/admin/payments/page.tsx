import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { isAdmin } from "@/lib/auth/requireAdmin";
import { MAIL, OWNER } from "@/lib/config/appEnv";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Record<string, any>;
const lc = (v: any) => (v == null ? "" : String(v)).toLowerCase();
const okStatus = new Set(["paid","success","succeeded","completed","authorized","captured","ok"]);

function safeStr(v: any) { return v == null ? "" : String(v); }
function pickAdminEmail(sp: SearchParams): string {
   const fromUrl = safeStr(sp.email).trim();
   if (fromUrl) return fromUrl;
   // 1) Yeni anahtar öncelikli: ADMIN_NOTIFY_EMAILS; eski anahtar varsa geriye uyumlu kalsın
  const allow = (process.env.ADMIN_NOTIFY_EMAILS || process.env.ADMIN_EMAILS || "")
     .split(",")
     .map(s => s.trim())
     .filter(Boolean);
   if (allow.length) return allow[0];
   // 2) Config'ten oku (ENV -> appEnv.ts)
   if (MAIL.adminNotify?.length) return MAIL.adminNotify[0];
   if (OWNER.email) return OWNER.email;
   // 3) Hiçbiri yoksa boş dön (link paramı boş kalır)
   return "";
 }

type OrderRow = Record<string, any>;
type PaymentRow = Record<string, any>;

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

export default async function AdminPaymentsPage({ searchParams }: { searchParams?: Promise<Record<string, any>> }) {
  noStore();

  const sp = (await searchParams) || {};
  const adminEmail = pickAdminEmail(sp);
  if (!isAdmin(adminEmail)) redirect("/");

  const { data: ordersData, error: oErr } = await supabaseAdmin
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (oErr) throw new Error(oErr.message);

  const orders: OrderRow[] = (ordersData || [])
    .filter((o: any) => lc(o.status) !== "pending"); // pending gizle

  // toplu payments fetch
  const orderIds = orders.map((o) => o.id);
  const paymentIds = orders.map((o) => o.payment_id).filter(Boolean);

  let payments: PaymentRow[] = [];
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
    const ok = okStatus.has(lc(p.status)) || !!(p as any).paid_at;
    if (!ok) continue;
    const raw = firstFinite([p.amount_total, p.total, p.amount_paid, p.amount, p.price, p.amount_minor]);
    if (raw == null) continue;
    const scaled = normalizeAmount(raw, p);
    if (scaled == null) continue;
    const oid = (p as any).order_id || (p as any).id;
    const prev = paySumByOrder.get(oid) || 0;
    paySumByOrder.set(oid, Number((prev + scaled).toFixed(2)));
  }

  return (
    <main className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Ödemeler</h1>

      <div className="border rounded overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Soru ID</th>
              <th className="px-3 py-2 text-left">Ödeme</th>
              <th className="px-3 py-2 text-left">Detay</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={3}>Kayıt bulunamadı.</td>
              </tr>
            )}

            {orders.map((o) => {
              const rawOrder = firstFinite([o.amount_total, o.total, o.amount, o.price, o.amount_minor]);
              let amount = normalizeAmount(rawOrder, o);
              if (amount == null || amount === 0) {
                const paySum = paySumByOrder.get(o.id) ?? (o.payment_id ? paySumByOrder.get(o.payment_id) : undefined);
                if (typeof paySum === "number" && isFinite(paySum) && paySum > 0) amount = paySum;
              }
              const ccy = (o as any).currency || (o as any).currency_code || "TRY";
              const qid = (o as any).question_id;

              return (
                <tr key={o.id} className="border-t">
                  <td className="px-3 py-2 align-top">
                    {qid ? (
                      <Link
                        className="text-blue-700 hover:underline"
                        href={`/admin/request/${qid}?email=${encodeURIComponent(adminEmail)}`}
                      >
                        {qid}
                      </Link>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {fmtMoney(amount, ccy)}
                    {/* 'Ödendi' etiketi kaldırıldı; sadece paid dışındaki durumlarda status göster */}
                    {o.status && lc(o.status) !== "paid" ? (
                      <span className="ml-2 text-xs text-gray-600">• {o.status}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Link className="underline" href={`/admin/orders/${o.id}`}>Detay</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
