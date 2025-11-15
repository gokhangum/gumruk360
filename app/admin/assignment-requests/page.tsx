import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { isAdmin } from "@/lib/auth/requireAdmin";
import Actions from "./Actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Record<string, any>;

type Item = {
  id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  question_id: string;
  worker_id: string;
  question?: {
    title: string | null;
    status: string | null;
    answer_status: string | null;
    is_urgent: boolean | null;
    sla_due_at: string | null;
    est_days_normal: number | null;
    est_days_urgent: number | null;
  };
  // zenginleştirilmiş alanlar:
  worker_email?: string;
  worker_full_name?: string;
  worker_display?: string; // Ad Soyad || Email || ID
};

function safeStr(v: any) { return v == null ? "" : String(v); }
function pickAdminEmail(sp: SearchParams): string {
  const fromUrl = safeStr(sp.email).trim();
  if (fromUrl) return fromUrl;
  const allow = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (allow.length) return allow[0];
  return process.env.ADMIN_EMAILS || "";
}

export default async function AssignmentRequestsPage({ searchParams }: { searchParams?: Promise<Record<string, any>> }) {
  const sp = (await searchParams) || {};
  noStore();

  const adminEmail = pickAdminEmail(sp);
  if (!isAdmin(adminEmail)) redirect("/");

  // SADECE PENDING TALEPLER
  const { data: reqs, error } = await supabaseAdmin
    .from("assignment_requests")
    .select("id, status, created_at, question_id, worker_id, questions:question_id (title, status, answer_status, is_urgent, sla_due_at, est_days_normal, est_days_urgent)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const list: Item[] = (reqs || []).map((r: any) => ({
    id: r.id,
    status: r.status,
    created_at: r.created_at,
    question_id: r.question_id,
    worker_id: r.worker_id,
    question: r.questions ? {
      title: r.questions.title,
      status: r.questions.status,
      answer_status: r.questions.answer_status,
      is_urgent: r.questions.is_urgent,
      sla_due_at: r.questions.sla_due_at,
      est_days_normal: r.questions.est_days_normal,
      est_days_urgent: r.questions.est_days_urgent,
    } : undefined,
  }));

  // Worker e-posta + ad-soyad zenginleştirmesi
  const workerIds = Array.from(new Set(list.map(x => x.worker_id)));
  let emailMap = new Map<string, string>();
  let nameMap  = new Map<string, string>();

  if (workerIds.length) {
    // auth.users → email
    const { data: users } = await supabaseAdmin
      .schema("auth")
      .from("users")
      .select("id, email")
      .in("id", workerIds);
    (users || []).forEach((u: any) => emailMap.set(u.id, u.email));

    // public.profiles → full_name
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", workerIds);
    (profs || []).forEach((p: any) => nameMap.set(p.id, p.full_name || ""));
  }

  for (const x of list) {
    const nm = (nameMap.get(x.worker_id) || "").trim();
    const em = (emailMap.get(x.worker_id) || "").trim();
    x.worker_full_name = nm || undefined;
    x.worker_email = em || undefined;
    x.worker_display = nm || em || x.worker_id;
  }

  return (
    <main className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Atama talepleri</h1>

      <div className="border rounded overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Başlık</th>
              <th className="px-3 py-2 text-left">Durumlar</th>
              <th className="px-3 py-2 text-left">SLA</th>
              <th className="px-3 py-2 text-left">Atama talep eden</th>
              <th className="px-3 py-2 text-left">Oluşturma</th>
              <th className="px-3 py-2 text-left">Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            {(list || []).map((r) => {
              const due = r.question?.sla_due_at
                ? new Date(r.question!.sla_due_at).toLocaleString("tr-TR")
                : "-";

              return (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 align-top font-mono">{r.id.slice(0, 8)}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{r.question?.title || "—"}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="text-xs">talep: <b>{r.status}</b></div>
                    <div className="text-xs">status: <b>{r.question?.status || "-"}</b></div>
                    <div className="text-xs">answer: <b>{r.question?.answer_status || "-"}</b></div>
                  </td>
                  <td className="px-3 py-2 align-top">{due}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="text-xs">{r.worker_display}</div>
                  </td>
                  <td className="px-3 py-2 align-top">{new Date(r.created_at).toLocaleString("tr-TR")}</td>
                  <td className="px-3 py-2 align-top">
                    <Actions id={r.id} adminEmail={adminEmail} />
                  </td>
                </tr>
              );
            })}
            {(!list || list.length === 0) && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={7}>
                  Kayıt bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
