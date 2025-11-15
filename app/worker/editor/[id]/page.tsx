import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import EditorPanel from "@/app/admin/request/[id]/EditorPanel";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import EditorAttachments from "./EditorAttachments";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import L2InfoSectionServer from "@/app/(dashboard)/ask/[id]/L2InfoSectionServer";
import { headers } from 'next/headers'
import { APP_DOMAINS } from "@/lib/config/appEnv";
function detectDomain(h: Headers) {
  const host = h.get('x-forwarded-host') || h.get('host') || ''
  return (host || '').split(':')[0] || APP_DOMAINS.primary
}

async function getL2Strictness(domain: string, locale: 'tr'|'en') {
  const { data } = await supabaseAdmin
    .from('gpt_precheck_settings')
    .select('l2_strictness')
    .eq('domain', domain)
    .eq('locale', locale)
    .maybeSingle()
  const raw = data?.l2_strictness
  return (typeof raw === 'number') ? Math.max(0, Math.min(3, Math.floor(raw))) : 1
}

/** strictness=0 ise hiç göstermeyen sarmalayıcı */
async function L2InfoMaybe({ id }: { id: string }) {
  const h = await headers()
  const domain = detectDomain(h)
     const locale: 'tr'|'en' =
    (APP_DOMAINS.en && domain.endsWith(APP_DOMAINS.en)) ? 'en' : 'tr'
  const strict = await getL2Strictness(domain, locale)
  if (strict === 0) return null
  return <L2InfoSectionServer id={id} locale={locale} />
}


export const dynamic = "force-dynamic";

const first = <T,>(arr?: T[] | null) => (arr && arr.length ? arr[0] : null);

async function getUserEmail() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options } as any);
          } catch {}
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: "", ...options } as any);
          } catch {}
        },
      },
    }
  );
  const { data } = await supabase.auth.getUser();
  return data?.user?.email || "";
}
 
 async function getUserId() {
   const cookieStore = await cookies();
   const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
       cookies: {
         get(name: string) { return cookieStore.get(name)?.value },
         set(name: string, value: string, options: any) { try { cookieStore.set({ name, value, ...options } as any) } catch {} },
         remove(name: string, options: any) { try { cookieStore.set({ name, value: "", ...options } as any) } catch {} },
       },
     }
   );
   const { data } = await supabase.auth.getUser();
   return data?.user?.id || "";
 }

export default async function WorkerEditorPage({
  params,
}: {
  params?: Promise<{ id: string }>;
}) {
  const p = ((await params) || {}) as { id: string };
  const t = await getTranslations("worker.editor");
  const id = p.id as string;


  // 1) Soru (başlık ve metni gösterebilmek için)
  const { data: q, error: qErr } = await supabaseAdmin
    .from("questions")
    .select("id, title, description, tenant_id")
    .eq("id", id)
    .maybeSingle();

  if (qErr || !q) return notFound();

  // 2) Editör initial: son taslak → revizyon fallback
  let initialContent = "";
  let latestVersion = 0;

  try {
    const { data: lastDraft } = await supabaseAdmin
      .from("answer_drafts")
      .select("id, version, content, model, created_at, created_by")
      .eq("question_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastDraft?.content) {
      initialContent = String(lastDraft.content);
      latestVersion = Number(lastDraft.version || 0);
    }
  } catch {}

  if (!initialContent) {
    try {
      const byNo = await supabaseAdmin
        .from("revisions")
        .select("id, content, revision_no, created_at")
        .eq("question_id", id)
        .order("revision_no", { ascending: false })
        .limit(1);
      const rev = first(byNo.data);
      if ((rev as any)?.content) initialContent = String((rev as any).content);
    } catch {}

    if (!initialContent) {
      try {
        const byVer = await supabaseAdmin
          .from("revisions")
          .select("id, content, version, created_at")
          .eq("question_id", id)
          .order("version", { ascending: false })
          .limit(1);
        const rev = first(byVer.data);
        if ((rev as any)?.content) initialContent = String((rev as any).content);
      } catch {}
    }

    if (!initialContent) {
      try {
        const byTime = await supabaseAdmin
          .from("revisions")
          .select("id, content, created_at")
          .eq("question_id", id)
          .order("created_at", { ascending: false })
          .limit(1);
        const rev = first(byTime.data);
        if ((rev as any)?.content) initialContent = String((rev as any).content);
      } catch {}
    }
  }

  
  const email = await getUserEmail();
   const userId = await getUserId();
   let draftAllowed = true;
   try {
     const { data: eff } = await supabaseAdmin.rpc("v_worker_draft_permission_effective", { in_worker_id: userId });
     draftAllowed = typeof eff === "boolean" ? eff : true;
   } catch {}

  const fastHref = `/worker/editor/${id}/hizli-uretim${email ? `?email=${encodeURIComponent(email)}` : ""}`;

  return (

       <div className="w-full max-w-[clamp(320px,90vw,1680px)] md:mx-auto px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
       <div className="card-surface shadow-colored p-2 md:p-2 space-y-2 min-w-0">
      {/* Üst Bilgi: Soru başlığı ve soru metni */}
      <section className="card-surface p-4 space-y-2 edge-underline edge-blue edge-taper edge-rise-2mm">
        <div className="text-sm text-gray-600 font-medium">{t("labels.question")}</div>
        <div className="text-lg font-semibold">{q.title || "-"}</div>
        {q.description ? (
          <div className="text-sm whitespace-pre-wrap text-gray-800">
            {q.description}
          </div>
        ) : (
          <div className="text-sm text-gray-500">{t("labels.noQuestion")}</div>
        )}
      </section>

      {/* Orijinal Soru Ekleri */}
     <section className="card-surface p-4 space-y-3">
        <h3 className="text-base font-medium">{t("labels.originalAttachments")}</h3>
        <div className="attachments-grid"><EditorAttachments questionId={q.id} /></div>
        <style>{`
  .attachments-grid ul, .attachments-grid .list, .attachments-grid .items { display: flex; flex-wrap: wrap; gap: 12px; }
  .attachments-grid li, .attachments-grid .item { flex: 0 1 280px; min-width: 220px; }
  .attachments-grid a { display: inline-flex; max-width: 100%; }
`}</style>
      </section>
<L2InfoMaybe id={id} />

           {/* Hızlı Üretim'e geçiş butonu (worker versiyonu) */}
       {draftAllowed && (
        <section className="card-surface p-4">
          <a
             href={fastHref}
             className="btn btn--primary text-sm h-10 px-4"
             title={t("actions.generateDraftFast")}
           >
             {t("actions.generateDraftFast")}
          </a>
         </section>
       )}



      {/* Editör paneli */}
      <EditorPanel
        questionId={q.id}
        adminEmail=""
        title={q.title ?? ""}
        description={q.description ?? ""}
        initialContent={initialContent}
        latestVersion={latestVersion}
      />
    </div> 
	  </div>     
        
    
  );
}
