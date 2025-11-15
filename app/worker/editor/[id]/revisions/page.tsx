import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type RevRow = {
  id: string;
  revision_no: number | null;
  created_at: string;
};

export default async function WorkerRevisionsPage({
  params,
}: {
  params?: Promise<{ id: string }>;
}) {
const p = ((await params) || {}) as { id: string };
  const id = p.id as string;
  const locale = await getLocale();
  const tRev = await getTranslations("revisions");

  // Soru var mı?
  const { data: q } = await supabaseAdmin
    .from("questions")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!q?.id) return notFound();

  // Revizyonları getir (author_email KOLONU YOK -> seçmiyoruz)
  const { data: revs, error } = await supabaseAdmin
    .from("revisions")
    .select("id, revision_no, created_at")
    .eq("question_id", id)
    .order("revision_no", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (revs || []) as RevRow[];

  

  return (

         <div className="-mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 w-full max-w-none md:max-w-[928px]">
         <div className="card-surface shadow-colored rounded-xl">
           <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
           <h1 className="text-xl md:text-2xl font-semibold">{tRev("title")}</h1>
           <Link
              href={`/worker/editor/${id}`}
               className="btn btn--outline text-sm h-9 px-3"
            >
               {tRev("backToEditor")}
             </Link>
          </div>
         <div className="p-5 overflow-x-auto">

      {!rows.length ? (
      <div className="text-sm text-gray-600">{tRev("empty")}</div>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-2 w-24">{tRev("table.no")}</th>
    <th className="p-2 w-56">{tRev("table.date")}</th>
     <th className="p-2 w-32">{tRev("table.action")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const canView = r.revision_no != null;
              return (
                <tr className="border-t" key={r.id}>
                  <td className="p-2">{r.revision_no ?? "-"}</td>
                  <td className="p-2">
                    {new Date(r.created_at).toLocaleString(locale)}
                  </td>
                  <td className="p-2">
                    {canView ? (
                                       <Link
                    className="btn btn--ghost text-sm h-9 px-3"
                       href={`/worker/editor/${id}/revisions/${r.revision_no}`}
                      >
                        {tRev("view")} →
                     </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
   
    </div>   
      </div>     
      </div>      
       
  );
}
