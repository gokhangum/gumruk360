import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { getTranslations, getLocale } from "next-intl/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth";


import RequestButton from "./RequestButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = {
  id: string;
  title: string | null;
  created_at: string;
};

export default async function WorkerPoolPage() {
  noStore();

  const t = await getTranslations("worker");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();

  // Aktif worker
  const auth = await supabaseAuth();
  const { data: u } = await auth.auth.getUser();
  const me = u?.user;
  const meId = me?.id || null;

  // HAVUZ: atanmamış ve status ∈ {approved, paid}
  const { data: questions, error: qErr } = await supabaseAdmin
    .from("questions")
    .select("id, title, created_at")
    .is("assigned_to", null)
    .in("status", ["approved", "paid"])
    .order("created_at", { ascending: false });

  if (qErr) {
    throw new Error(qErr.message);
  }
  const rows: Row[] = questions || [];

  // Bu worker’ın talep durumları
  let reqMap = new Map<string, string>(); // question_id -> status
  if (meId && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const { data: reqs } = await supabaseAdmin
      .from("assignment_requests")
      .select("question_id, status")
      .eq("worker_id", meId)
      .in("question_id", ids);

    (reqs || []).forEach((r: any) => reqMap.set(r.question_id, r.status));
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">{t("pool")}</h1>

      <ul className="divide-y border rounded">
        {rows.map((r) => {
          const reqStatus = meId ? reqMap.get(r.id) : undefined;

          return (
            <li key={r.id} className="p-4 flex items-center justify-between gap-6">
              {/* SOL: Başlık (link) + tarih */}
              <div className="min-w-0">
                <div className="text-base">
                  <Link
                    href={`/worker/questions/${r.id}`}
                    className="font-medium underline-offset-2 hover:underline focus:underline line-clamp-1"
                  >
                    {r.title || "-"}
                  </Link>
                </div>
                <div className="text-xs text-gray-500">
                  {r.created_at ? new Date(r.created_at).toLocaleString(locale) : ""}
                </div>
              </div>

              {/* SAĞ: Atama talebi */}
              <div className="text-sm flex items-center gap-3">
                {reqStatus === "pending" ? (
                  <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">
                    {t("assignmentRequested")}
                  </span>
                ) : reqStatus === "approved" ? (
                  <span className="px-2 py-1 rounded bg-green-50 text-green-700">
                    {t("assignmentApproved")}
                  </span>
                ) : reqStatus === "rejected" ? (
                  <span className="px-2 py-1 rounded bg-red-50 text-red-700">
                    {t("assignmentRejected")}
                  </span>
                ) : meId ? (
                  <RequestButton questionId={r.id} />
                ) : (
                  <Link className="underline" href="/auth/login">
                    {tCommon("login")}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
        {!rows.length && (
          <li className="text-gray-500 p-4">{tCommon("noRecords")}</li>
        )}
      </ul>
    </div>
  );
}
