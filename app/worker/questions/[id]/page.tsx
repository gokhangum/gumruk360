import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth";
import WorkerAttachments from "./WorkerAttachments";
import RequestButton from "@/app/worker/pool/RequestButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AnyRecord = Record<string, any>;

function pickDescription(q: AnyRecord): string | null {
  return (
    q?.description ??
    q?.detail ??
    q?.content ??
    q?.body ??
    null
  );
}

export default async function WorkerQuestionDetailPage({
  params,
}: {
  params?: Promise<{ id: string }>;
}) {

  noStore();

  const locale = await getLocale();
  const t = await getTranslations("worker");
  const tCommon = await getTranslations("common");
  

const p = ((await params) || {}) as { id: string };
const id = p.id as string;


  // Aktif kullanıcı (audit ve atama talebi durumu için)
  const auth = await supabaseAuth();
  const { data: u } = await auth.auth.getUser();
  const meId = u?.user?.id || null;

  // Soru
  const { data: question, error: qErr } = await supabaseAdmin
    .from("questions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (qErr) {
    throw new Error(qErr.message);
  }
  if (!question) {
    notFound();
  }

  // Bu kullanıcının bu soruya dair atama talebi var mı?
  let reqStatus: string | undefined = undefined;
  if (meId) {
    const { data: req } = await supabaseAdmin
      .from("assignment_requests")
      .select("status")
      .eq("worker_id", meId)
      .eq("question_id", id)
      .maybeSingle();
    reqStatus = req?.status;
  }

  // Audit log — zorunlu alanlara uyacak minimal kayıt
  try {
    if (meId) {
      await supabaseAdmin.from("audit_logs").insert({
        action: "view",
        resource_type: "question",
        resource_id: id,
        question_id: id,
        actor_user_id: meId,
        event: "worker.view_question",
        entity_type: "question",
        entity_id: id,
      } as AnyRecord);
    }
  } catch {
    // audit hatasını yut
  }

  const title: string = question?.title ?? "-";
  const description = pickDescription(question);
  const createdAt = question?.created_at
    ? new Date(question.created_at).toLocaleString(locale)
    : "";

  const assignedTo: string | null = question?.assigned_to ?? null;
  const isAssignedToMe = !!(assignedTo && meId && assignedTo === meId);
  const isFree = !assignedTo;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <span className="text-xs text-gray-500">{createdAt}</span>
      </div>

      {description ? (
        <div className="prose max-w-none whitespace-pre-wrap">
          {description}
        </div>
      ) : (
        <div className="text-sm text-gray-500">-</div>
      )}

      {/* SADECE soru + ekler */}
      <WorkerAttachments questionId={id} />

      {/* Atama talebi alanı — görünümü bozmadan, eklerin altında */}
      <section className="pt-2">
        {meId ? (
          isAssignedToMe ? (
            <span className="inline-block px-2 py-1 rounded bg-green-50 text-green-700 text-sm">
              {t("assignmentApproved")}
            </span>
          ) : isFree ? (
            reqStatus === "pending" ? (
              <span className="inline-block px-2 py-1 rounded bg-blue-50 text-blue-700 text-sm">
                {t("assignmentRequested")}
              </span>
            ) : reqStatus === "rejected" ? (
              <span className="inline-block px-2 py-1 rounded bg-red-50 text-red-700 text-sm">
                {t("assignmentRejected")}
              </span>
            ) : (
              <RequestButton questionId={id} />
            )
          ) : null
        ) : (
          <Link className="underline" href="/auth/login">
            {tCommon("login")}
          </Link>
        )}
      </section>

      <div className="pt-2">
        <Link
          href="/worker/pool"
          className="inline-flex items-center gap-2 rounded border px-3 py-1.5 hover:bg-gray-50"
        >
          ← {t("backToPool")}
        </Link>
      </div>
    </div>
  );
}
