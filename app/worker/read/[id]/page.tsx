import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth";
import WorkerAttachments from "@/app/worker/questions/[id]/WorkerAttachments";
import { Badge } from "@/components/ui/Badge";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AnyRec = Record<string, any>;

export default async function WorkerReadPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const t = await getTranslations("worker");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();

  // Oturum kullanıcısı
  const auth = await supabaseAuth();
  const { data: userResp } = await auth.auth.getUser();
  const uid = userResp?.user?.id || null;
  if (!uid) return notFound();

  // Soru: sadece kendisine atanmış olanı görsün
  const { data: q } = await supabaseAdmin
    .from("questions")
    .select("id,title,description,created_at,assigned_to,answer_status,answer_sent_at,currency,price_final_tl,price_tl,price_cents")
    .eq("id", id)
    .eq("assigned_to", uid)
    .maybeSingle();

  if (!q) return notFound();

  // Cevabın son versiyonu (varsa)
  const { data: ans } = await supabaseAdmin
    .from("answers")
    .select("id,content_md,created_at,delivered_at,version")
    .eq("question_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

 return (
   <div className="bg-gradient-to-b from-white to-slate-0 py-1">
      <div className="px-3 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
        <div className="card-surface shadow-colored rounded-xl">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
              <span className="truncate max-w-[70vw]">{q.title || "-"}</span>
              {q.answer_status === "sent" && (
                <Badge tone="success" className="shrink-0">{t("sent")}</Badge>
              )}
            </h1>
            <Link href="/worker/done" className="btn btn--outline text-sm">
              {tCommon("back")}
            </Link>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            {/* Soru özeti */}
            <section className="border rounded p-4 space-y-2">
              <div className="text-sm text-gray-500">
                {q.id} · {new Date(q.created_at).toLocaleString(locale)}
              </div>
              {q.description ? (
                <div className="prose dark:prose-invert whitespace-pre-wrap">
                  {q.description}
                </div>
              ) : (
                <div className="text-sm text-gray-500">{tCommon("noDescription")}</div>
              )}
            </section>

            {/* Soru/Cevap ekleri */}
            <WorkerAttachments questionId={q.id} />

            {/* Cevap içeriği (salt okunur) */}
            <section className="border rounded p-4 space-y-3">
              <h2 className="text-lg font-medium">{t("answer")}</h2>
              {!ans ? (
                <div className="text-sm text-gray-500">{t("noAnswerYet")}</div>
              ) : (
                <>
                  <div className="text-xs text-gray-500">
                    {t("answer")} #{ans.version ?? 1} ·{" "}
                    {new Date(ans.created_at).toLocaleString(locale)}
                    {ans.delivered_at
                      ? ` · ${t("sent")} ${new Date(ans.delivered_at).toLocaleString(locale)}`
                      : ""}
                  </div>
                  <div className="prose dark:prose-invert whitespace-pre-wrap">
                    {ans.content_md}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
