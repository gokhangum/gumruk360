// app/dashboard/orders/page.tsx
import { redirect } from "next/navigation"
import { supabaseAuthServer as supabaseAuth } from "@/lib/supabaseAuth"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import { getTranslations, getLocale } from "next-intl/server"

export const dynamic = "force-dynamic"

type Row = {
  id: string
  status: string
  amount: number | null
  currency: string | null
  created_at: string
}

export default async function OrdersIndex() {
  const tNav = await getTranslations("nav")
  const tCommon = await getTranslations("common")
  const locale = await getLocale()
function formatAmountMinor(amount: number | null | undefined, currency?: string | null) {
  if (amount == null || !Number.isFinite(Number(amount))) return "-"
  const v = Number(amount) / 100 // minor (kuruş) -> major (TRY)
  const nf = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${nf.format(v)} ${currency || "TRY"}`
}

  // Oturum
  const auth = await supabaseAuth()
  const { data: u } = await auth.auth.getUser()
  const uid = u?.user?.id
  if (!uid) {
    redirect(`/login?next=${encodeURIComponent("/dashboard/orders")}`)
  }

  // Bu kullanıcının soruları
  const { data: qs, error: qErr } = await supabaseAdmin
    .from("questions")
    .select("id")
    .eq("user_id", uid)
  if (qErr) {
    console.error(
      "[orders] questions fetch failed:",
      qErr.message ?? JSON.stringify(qErr)
    )
  }

  const qids = (qs || []).map((x: any) => x.id as string)

  // Yalnızca PAID siparişler: (1) question_id bu kullanıcıya ait sorular, (2) direkt user_id = kullanıcı
  const rows: Row[] = []
  // (1) question_id üzerinden
  if (qids.length) {
    const { data: os, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, amount, currency, created_at")
      .in("question_id", qids)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
   if (oErr) {
           {
        const msg =
          oErr?.message ?? JSON.stringify(oErr)
        if (typeof msg === "string" && msg.toLowerCase().includes("fetch failed")) {
          console.warn("[orders] orders by question_id fetch failed (network):", msg)
        } else {
          console.error("[orders] orders by question_id fetch failed:", msg)
        }
      }
    }
    rows.push(...((os || []) as Row[]))
  }
  // (2) user_id üzerinden
  {
    const { data: ou, error: ouErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, amount, currency, created_at")
      .eq("user_id", uid)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
 if (ouErr) {
   {
     const msg =
       ouErr?.message ?? JSON.stringify(ouErr)
     if (typeof msg === "string" && msg.toLowerCase().includes("fetch failed")) {
       console.warn("[orders] orders by user_id fetch failed (network):", msg)
     } else {
       console.error("[orders] orders by user_id fetch failed:", msg)
     }
   }
  }
    rows.push(...((ou || []) as Row[]))
  }

  // Tekilleştir + tarihe göre sırala
  const uniqMap = new Map<string, Row>()
  for (const r of rows) uniqMap.set(r.id, r)
  const merged = Array.from(uniqMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

   return (
   
     <div className="-mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 w-full max-w-none md:max-w-[800px]">
        <div className="card-surface shadow-colored rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
            <h1 className="text-xl md:text-2xl font-semibold">{tNav("myPayments")}</h1>
          </div>

          <div className="p-5 overflow-x-auto">
            <ul className="grid gap-3">
              {merged.map((o) => (
                <li
                  key={o.id}
                  className="border rounded p-3 grid grid-cols-[1fr_auto] items-start gap-3 min-w-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">#{o.id}</div>
                    <div className="text-sm text-gray-600">
                      {formatAmountMinor(o.amount, o.currency)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(o.created_at).toLocaleString(locale)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 whitespace-nowrap">
                    <a className="btn btn--outline text-sm" href={`/dashboard/orders/${o.id}`}>
                      {tCommon("detailArrow")}
                    </a>
                  </div>
                </li>
              ))}

              {!merged.length && (
                <li className="text-gray-500 text-sm">{tCommon("noRecords")}</li>
              )}
            </ul>
          </div>
        </div>
      </div>

  )
}
