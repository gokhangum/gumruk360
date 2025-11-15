'use client'
import { useEffect, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { useTranslations, useLocale } from "next-intl"
function parseNum(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatTLInt(n: number, locale: string): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  // Ondalık GÖSTERME: maksimum 0 ondalık
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(n))
}

export default function SummaryDynamic({ id }: { id: string }) {
	const t = useTranslations("ask")
const locale = useLocale()
  const [feeTl, setFeeTl] = useState<string>("—")
  const [requiredCredits, setRequiredCredits] = useState<string>("—")
  const [balance, setBalance] = useState<string>("—")
  const supabase = createClientComponentClient()

  useEffect(() => {
    let alive = true
    ;(async () => {
      // 1) Ücret: questions.price_final_tl (id = question uuid)
      try {
        const { data, error } = await supabase
          .from("questions")
          .select("id, price_final_tl")
          .eq("id", id)
          .limit(1)
          .maybeSingle()
        if (!error && data) {
          const fee = parseNum((data as any)?.price_final_tl)
          if (alive) setFeeTl(formatTLInt(fee, locale))
        }
      } catch {}

      // 2) Gerekli Kredi
      try {
        const co = await fetch(`/api/ask/${id}/credit-options`, { cache: "no-store" })
        if (co.ok) {
          const js = await co.json()
          const req = parseNum(js?.requiredUserCredits ?? js?.requiredCredits ?? js?.requiredOrgCredits)
          if (alive) setRequiredCredits(req ? String(req) : "—")
        }
      } catch {}

      // 3) Bakiye
      try {
        const b = await fetch(`/api/dashboard/balance`, { cache: "no-store" })
        if (b.ok) {
          const bj = await b.json()
          const userBal = parseNum(bj?.user_balance ?? bj?.balance)
          if (alive) setBalance(new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(userBal))

        }
      } catch {}
    })()
    return () => { alive = false }
  }, [id, supabase])

  return (
    <>
      <div className="space-y-1">
        <div className="text-gray-500">{t("terms.summary.priceTL")}</div>
        <div className="font-medium">{feeTl}</div>
      </div>
      <div className="space-y-1">
        <div className="text-gray-500">{t("terms.summary.requiredCredits")}</div>
        <div className="font-medium">{requiredCredits}</div>
      </div>
      <div className="space-y-1">
        <div className="text-gray-500">{t("terms.summary.balance")}</div>

        <div className="font-medium">{balance}</div>
      </div>
    </>
  )
}
