import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string | null;
  status: string | null;
  created_at: string;
  is_urgent: boolean | null;
  est_days_normal: number | null;
  est_days_urgent: number | null;
  sla_due_at: string | null;
};

function computeDueAt(r: Row): Date | null {
  if (r.sla_due_at) {
    const d = new Date(r.sla_due_at);
    if (!isNaN(d.getTime())) return d;
  }
  const created = r.created_at ? new Date(r.created_at).getTime() : NaN;
  if (!Number.isFinite(created)) return null;
  const days =
    (r.is_urgent ? Number(r.est_days_urgent) : Number(r.est_days_normal)) || 0;
  const ms = created + Math.max(0, days) * 86400000;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

function formatLeft(t: (k: string) => string, due: Date | null): string {
  if (!due) return "—";
  const now = Date.now();
  const diff = due.getTime() - now; // >0: left, <0: overdue
  const abs = Math.abs(diff);
  const day = 86400000;
  const hour = 3600000;
  const minute = 60000;

  const days = Math.floor(abs / day);
  const hours = Math.floor((abs % day) / hour);
  const minutes = Math.floor((abs % hour) / minute);

  const parts: string[] = [];
   if (days > 0) parts.push(`${days} ${t("time.dayShort")}`);
   if (hours > 0 || (days > 0 && minutes > 0))
     parts.push(`${hours} ${t("time.hourShort")}`);
   if (days === 0 && hours === 0)
     parts.push(`${minutes} ${t("time.minuteShort")}`);

  const core = parts.join(" ");
   if (diff >= 0) return `${core} ${t("time.leftSuffix")}`;
   const overduePrefix = t("time.overduePrefix");
   const overdueSuffix = t("time.overdueSuffix");
   return overduePrefix ? `${overduePrefix} ${core}` : `${core} ${overdueSuffix}`;
}

/**
 * Satır arka plan rengi (öncelik sırası):
 *  1) diff < 0            → kırmızı
 *  2) diff <= 6 saat      → kahverengi (amber)
 *  3) diff <= 12 saat     → sarı
 *  4) aksi                → normal
 */
function rowBgClass(due: Date | null): string {
  if (!due) return "";
  const now = Date.now();
  const diff = due.getTime() - now;
  const hour = 3600000;

  if (diff < 0) return "bg-red-100";
  if (diff <= 6 * hour) return "bg-amber-200";
  if (diff <= 12 * hour) return "bg-yellow-100";
  return "";
}

function labelForStatus(t: (k: string) => string, status: string | null | undefined) {
  const s = (status || "").toLowerCase();
  
  switch (s) {
    case "submitted": return t("status.submitted");
     case "approved":  return t("status.approved");
     case "rejected":  return t("status.rejected");
     case "paid":      return t("status.paid");
    default:          return status || "-";
  }
}

export default async function WorkerAssignedPage() {
 const t = await getTranslations('worker.assigned');

  // Auth
  const auth = await supabaseAuth(); 
const { data: u } = await auth.auth.getUser();
  const uid = u?.user?.id;

  // Sadece bana atanan sorular
  let rows: Row[] = [];
  if (uid) {
    const { data, error } = await supabaseAdmin
      .from("questions")
      .select(
        "id, title, status, created_at, is_urgent, est_days_normal, est_days_urgent, sla_due_at"
      )
      .eq("assigned_to", uid)
            .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }
    rows = (data || []) as Row[];
  }

  const heading = t("heading");
 const lblId = t("table.id");
 const lblTitle = t("table.title");
 const lblStatus = t("table.status");
 const lblLeft = t("table.left");
 const lblAction = t("table.action");
 const lblNoRecords = t("table.noRecords");
 const lblGoEditor = t("table.goEditor");

  return (
  
    <div className="w-full max-w-none px-0 md:max-w-[clamp(320px,90vw,1028px)] md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
       <div className="card-surface shadow-colored p-5 md:p-6 space-y-5">
	    <div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 mb-4 flex items-center gap-3">
      <h1 className="text-lg font-semibold tracking-tight">{heading}</h1></div>
    {/* Mobile list (stacked rows) */}
     <div className="md:hidden">
      {rows.length ? (
         rows.map((r) => {
           const due = computeDueAt(r);
          const left = formatLeft(t, due);
           const bg = rowBgClass(due);
           return (
            <div key={r.id} className={`px-3 py-3 border-b border-slate-200 ${bg || ""}`}>
               <div className="flex items-center justify-between text-[11px] text-slate-500">
                 <span>{lblId}</span>
                <span className="font-mono">{r.id.slice(0,8)}…</span>
               </div>
               <div className="mt-1 text-sm font-medium">{r.title || "-"}</div>
               <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">{lblStatus}</span>
                <span className="text-sm">{labelForStatus(t, r.status)}</span>
             </div>
               <div className="mt-1 flex items-center justify-between">
                 <span className="text-[11px] text-slate-500">{lblLeft}</span>
                 <span className="text-sm">{left}</span>
              </div>
              <div className="mt-2">
                 <Link href={`/worker/editor/${r.id}`} className="btn btn--sm">{lblGoEditor}</Link>
               </div>
             </div>
          );
         })
       ) : (
         <div className="p-4 text-center text-gray-500">{lblNoRecords}</div>
       )}
     </div>
 
     {/* Desktop table */}
     <div className="card-surface p-0 overflow-x-auto hidden md:block">
       <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left">
           <tr>
            <th className="p-2 w-40">{lblId}</th>
             <th className="p-2">{lblTitle}</th>
            <th className="p-2 w-40">{lblStatus}</th>
             <th className="p-2 w-40">{lblLeft}</th>
             <th className="p-2 w-36">{lblAction}</th>
           </tr>
         </thead>
         <tbody>
           {rows.length ? (
           rows.map((r) => {
              const due = computeDueAt(r);
               const left = formatLeft(t, due);
              const bg = rowBgClass(due);
               return (
                 <tr key={r.id} className={bg}>
                  <td className="p-2 font-mono">{r.id}</td>
                   <td className="p-2">{r.title || "-"}</td>
                   <td className="p-2">{labelForStatus(t, r.status)}</td>
                  <td className="p-2">{left}</td>
                  <td className="p-2">
                    <Link href={`/worker/editor/${r.id}`} className="btn btn--sm">{lblGoEditor}</Link>
                   </td>
                </tr>
              );
             })
           ) : (
            <tr>
              <td className="p-4 text-center text-gray-500" colSpan={5}>
                {lblNoRecords}
              </td>
             </tr>
           )}
         </tbody>
       </table>
</div>

   </div>          
 </div>     
   );
 }