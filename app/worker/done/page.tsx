import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth";
import { getTranslations, getLocale } from "next-intl/server";
import { Badge } from "@/components/ui/Badge";
export const dynamic = "force-dynamic";

type Row = { id: string; title: string | null; created_at: string; answer_status: string | null };



export default async function WorkerDonePage() {
  const t = await getTranslations("worker");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();

  const auth = await supabaseAuth();
  const { data: userResp } = await auth.auth.getUser();
  const uid = userResp?.user?.id || null;

  let rows: Row[] = [];
  if (uid) {
    const { data } = await supabaseAdmin
      .from("questions")
      .select("id,title,created_at,assigned_to,answer_status")
      .eq("assigned_to", uid)
      .in("answer_status", ["completed", "sent"])
      .order("created_at", { ascending: false })
      .limit(50);
    rows = (data as Row[]) || [];
  }

  return (

         <div className="w-full max-w-none md:max-w-[clamp(320px,90vw,928px)] -mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
         <div className="card-surface shadow-colored rounded-xl">
           <div className="px-5 py-4 border-b border-slate-100">
             <h1 className="text-xl md:text-2xl font-semibold">{t("done")}</h1>
           </div>

           <div className="p-5 overflow-x-auto">
             {!rows.length && (
               <div className="text-gray-500 text-sm">
                 {tCommon("noRecords")}
               </div>
             )}

             <ul className="grid gap-3">
               {rows.map((r) => (
                 <li
                   key={r.id}
                   className="border rounded p-3 grid grid-cols-[1fr_auto] items-start gap-3 min-w-0"
                 >
                   <div className="min-w-0">
                     <div className="font-medium break-words whitespace-normal leading-snug">
                       <Link
                         href={`${r.answer_status === "sent" ? "/worker/read" : "/worker/editor"}/${r.id}`}
                         className="hover:underline"
                       >
                         {r.title || "-"}
                       </Link>
                     </div>
                     <div className="text-xs text-gray-500">
                       {r.id} · {new Date(r.created_at).toLocaleString(locale)}
                     </div>
                   </div>

                   <div className="flex items-center gap-3">
                     {r.answer_status === "sent" && (
                       <Badge tone="success" className="whitespace-nowrap">{t("sent")}</Badge>
                     )}
                     <Link
                       href={`${r.answer_status === "sent" ? "/worker/read" : "/worker/editor"}/${r.id}`}
                       className="btn btn--outline text-sm"
                     >
                       {r.answer_status === "sent" ? t("view") : t("openEditor")}
                     </Link>
                   </div>
                 </li>
               ))}
             </ul>
           </div>
         </div>
       </div>
   
  );
}
