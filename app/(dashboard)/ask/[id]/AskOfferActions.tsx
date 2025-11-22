"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import CreditPayButtons from "./CreditPayButtons";
import OrgTopUpButton from "./OrgTopUpButton";
import { useTranslations, useLocale } from "next-intl"
import { pushEvent } from "@/lib/datalayer";
type Props = {
  questionId: string
  status?: string | null
  canAccept?: boolean
  pendingOrderId?: string | null
  /** Kurumsal üyelik veya aktif org üyeliği varsa true. */
  isCorporate?: boolean
}

type CreditOptions = {
  requiredCredits: number;
  requiredUserCredits: number;
  requiredOrgCredits: number;
  userBalance: number;
  orgBalance?: number | null;
  canUserPay: boolean;
  canOrgPay: boolean;
  meta?: { hasActiveOrg?: boolean } | null;
}

export default function AskOfferActions({ questionId, isCorporate }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<"acc" | "rej" | null>(null)
const t = useTranslations("ask.offerActions")
const locale = useLocale()
  // Kurumsal yeterlilik: organization_members kaydı varsa ve orgBalance >= requiredOrgCredits
  const [orgEligible, setOrgEligible] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        // Kurumsal değilse istek atmaya gerek yok
        if (!isCorporate) {
          if (mounted) setOrgEligible(false)
          return
        }
        const res = await fetch(`/api/ask/${questionId}/credit-options`, { cache: "no-store" })
        if (!res.ok) return
        const js: CreditOptions = await res.json()
        const hasOrg = !!js?.meta?.hasActiveOrg
        const requiredOrg = Number(js?.requiredOrgCredits ?? 0)
        const orgBal = Number(js?.orgBalance ?? 0)
        const ok =
          hasOrg &&
          Number.isFinite(requiredOrg) &&
          requiredOrg > 0 &&
          orgBal >= Math.ceil(requiredOrg)
        if (mounted) setOrgEligible(ok)
      } catch {
        if (mounted) setOrgEligible(false)
      }
    })()
    return () => { mounted = false }
  }, [questionId, isCorporate])

  async function acceptOffer() {
    setBusy("acc")
    try {
		const host = typeof window !== "undefined" ? window.location.hostname : "";
    const tenant = host.includes("easycustoms360") ? "easycustoms360" : "gumruk360";
    const locale = tenant === "easycustoms360" ? "en-US" : "tr-TR";

    // Fiyat bu komponentte yoksa, minimum olarak question_id ve tenant/locale yollayalım
    pushEvent("offer_accepted", {
      tenant,
      locale,
      question_id: questionId,
    });
      router.push(`/ask/${questionId}/terms`)
    } finally {
      setBusy(null)
    }
  }

  async function rejectOffer() {
    setBusy("rej")
    try {
	       const host = typeof window !== "undefined" ? window.location.hostname : ""
   const tenant = host.includes("easycustoms360") ? "easycustoms360" : "gumruk360"
      const locale = tenant === "easycustoms360" ? "en-US" : "tr-TR"

      pushEvent("offer_rejected", {
      tenant,
       locale,
       question_id: questionId,
      })
      await fetch(`/api/ask/${questionId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      })
      router.push("/dashboard/questions")
    } catch {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={acceptOffer}
        disabled={busy !== null}
        className="btn text-sm px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
        title={t("acceptTitle")}
      >
        {busy === "acc" ? t("processing") : t("accept")}
      </button>

      {/* Yeni: Kurum Kredisi Kullan (amber) — organization_members kaydı varsa ve orgBalance>=requiredOrgCredits */}
      {orgEligible && (
        <button
          onClick={() => router.push(`/ask/${questionId}/confirm-org-credits`)}
          className="px-3 py-1.5 rounded border bg-amber-500 hover:bg-amber-600 text-white"
          title={t("orgUseCreditsTitle")}
        >
          {t("orgUseCredits")}
        </button>
      )}

      {/* Mavi bireysel kredi satın al butonu — bireysel akış */}
      {!isCorporate && (
        <div className="credit-btn-blue">
          <CreditPayButtons questionId={questionId} />

          <style jsx>{`
            .credit-btn-blue :global(button) {
              background-color: #2563eb;
              color: #ffffff;
              border-radius: 0.375rem;
              padding: 0.5rem 0.75rem;
            }
            .credit-btn-blue :global(button:hover) {
              background-color: #1d4ed8;
            }
            .credit-btn-blue :global(button:disabled) {
              opacity: 0.5;
            }
          `}</style>
        </div>
      )}

      <button
        onClick={rejectOffer}
        disabled={busy !== null}
        className="btn text-sm px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
        title={t("rejectTitle")}
      >
        {busy === "rej" ? t("processing") : t("reject")}
      </button>

      {/* Org kredi yetersiz ise (orgBalance < requiredOrgCredits) sarı buton – kendi içinde kontrol eder */}
      <OrgTopUpButton questionId={questionId} />
    </div>
  )
}
