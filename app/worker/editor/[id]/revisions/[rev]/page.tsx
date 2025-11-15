import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

export default async function WorkerRevisionDetailPage({
  params,
}: {
  params?: Promise<{ id: string; rev: string }>;
}) {
  const p = ((await params) || {}) as { id: string; rev: string };
  const id  = p.id  as string;
  const rev = p.rev as string;

  const locale = await getLocale();
const tRev = await getTranslations("revisions");
  // rev parametresi sayısal olmalı (revision_no)
  const revNo = Number.parseInt(rev, 10);
  if (!Number.isFinite(revNo)) return notFound();

  // 1) Soru başlığı (opsiyonel, üstte küçük bilgi için)
  const { data: q } = await supabaseAdmin
    .from("questions")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();
  if (!q?.id) return notFound();

  // 2) İstenen revizyonu getir (revision_no ile)
  const { data: r } = await supabaseAdmin
    .from("revisions")
    .select("id, revision_no, content, content_html, created_at")
    .eq("question_id", id)
    .eq("revision_no", revNo)
    .maybeSingle();

  if (!r?.id) return notFound();

 

  return (

       <div className="-mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 w-full max-w-none md:max-w-[928px]">
         <div className="card-surface shadow-colored rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h1 className="text-xl md:text-2xl font-semibold">
              {tRev("detail.heading", { no: r.revision_no ?? "-" })}
             </h1>
            <div className="flex items-center gap-2">
              <Link
                 href={`/worker/editor/${id}/revisions`}
                className="btn btn--outline text-sm h-9 px-3"
                prefetch={false}
              >
                {tRev("title")}
             </Link>
              <Link
               href={`/worker/editor/${id}`}
               className="btn btn--outline text-sm h-9 px-3"
                prefetch={false}
              >
                 {tRev("backToEditor")}
              </Link>
           </div>
         </div>
         <div className="p-5 space-y-4">

      {/* Üst bilgi: soru ve tarih */}
      <section className="text-sm space-y-1">
        <div className="text-gray-700">
          <span className="font-medium">{tRev("detail.labels.question")}:</span>{" "}
          <span className="font-normal">{q.title || "-"}</span>
        </div>
        <div className="text-gray-700">
          <span className="font-medium">{tRev("detail.labels.date")}:</span>{" "}
          <span className="font-normal">
            {new Date(r.created_at).toLocaleString(locale)}
          </span>
        </div>
      </section>

      {/* İçerik */}
      <section className="">
        { (r as any).content_html && (r as any).content_html.trim().length > 0 ? (
           <div
            className="prose prose-sm max-w-none"
           dangerouslySetInnerHTML={{ __html: (r as any).content_html }}
          />
      ) : (
          <div className="whitespace-pre-wrap text-sm text-gray-900">
             {r.content || tRev("detail.emptyContent")}
        </div>
        )}

     
      </section>
        </div>       
  </div>        
 </div>           

  );
}
