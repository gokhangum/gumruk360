import Link from "next/link"
import { redirect } from "next/navigation"
import { getLocale } from "next-intl/server"
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import { getTranslations } from "next-intl/server"
import { Badge } from "@/components/ui/Badge"
export const dynamic = "force-dynamic"

type Row = {
  id: string
  title: string | null
  status: string | null
  created_at: string
}



export default async function QuestionsIndexPage() {
  const locale = await getLocale()

  // Auth
  const auth = await supabaseAuth()
  const { data: u } = await auth.auth.getUser()
  const uid = u?.user?.id
  if (!uid) {
    redirect(`/login?next=${encodeURIComponent("/dashboard/questions")}`)
  }

  // Bu kullanıcının soruları
  const { data, error } = await supabaseAdmin
    .from("questions")
    .select("id, title, status, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }
const t = await getTranslations("questions.list")
const tCommon = await getTranslations("common")
const tStatus = await getTranslations("questions.status");
  const rows = (data || []) as Row[]
  const heading = t("heading")

  return (
      
      <div className="-mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 w-full max-w-none md:max-w-[800px]">
        <div className="card-surface shadow-colored rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
            <h1 className="text-xl md:text-2xl font-semibold">{heading}</h1>
          </div>

          <div className="p-5 overflow-x-auto">
            {!rows.length && (
              <div className="text-gray-500 text-sm">
                {t("noRecords")}
              </div>
            )}

            <ul className="grid gap-3">
              {rows.map((q) => (
                <li
  key={q.id}
  className="border rounded p-3 grid grid-cols-[1fr_auto] items-start gap-3 min-w-0"
>
                  <div className="min-w-0">
                    <div className="font-medium break-words whitespace-normal leading-snug">
                      <Link href={`/dashboard/questions/${q.id}`} className="hover:underline">
                        {q.title || t("untitled")}
                      </Link>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(q.created_at).toLocaleString(locale)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 whitespace-nowrap">
                    <span>
                      {(() => {
                        const key = String(q.status || "").toLowerCase();
                        const known = ["new","submitted","approved","rejected","paid","pending","priced","closed"];
                        const label = known.includes(key) ? tStatus(key) : (q.status || "-");
                        const tone =
                          key === "approved" || key === "paid" || key === "closed"
                            ? "success"
                            : key === "pending" || key === "submitted"
                            ? "warning"
                            : key === "rejected"
                            ? "danger"
                            : key === "priced"
                            ? "info"
                            : "muted";
                        return <Badge tone={tone as any} className="whitespace-nowrap">{label}</Badge>;
                      })()}
                    </span>

                    <Link
                      href={`/dashboard/questions/${q.id}`}
                      className="btn btn--outline text-sm"
                    >
                      {tCommon("detailArrow")}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
   

  )
}
