"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { pushEvent } from "@/lib/datalayer";
export default function TermsClient({ questionId, displayCurrency, children }: { questionId: string; displayCurrency?: string; children?: ReactNode }) {

  const router = useRouter()
  const t = useTranslations();
  const [checked, setChecked] = useState(false)
  const [busy, start] = useTransition()

  const proceed = () => {
    if (!checked) return
    start(async () => {
      try {
	        const host = typeof window !== "undefined" ? window.location.hostname : ""
     const tenant = host.includes("easycustoms360") ? "easycustoms360" : "gumruk360"
     const locale = tenant === "easycustoms360" ? "en-US" : "tr-TR"

     // Ödeme akışı (PayTR / Paddle) buradan başlıyor
      pushEvent("payment_started", {
         tenant,
        locale,
        question_id: questionId,
          source_step: "terms",
       })
        // 1) ToS kabul kaydı
        await fetch(`/api/ask/${questionId}/tos-accept`, { method: "POST" }).catch(() => {})

       // 2) Para birimine göre yönlendir:
       if ((displayCurrency || "").toUpperCase() === "USD") {
         // Paddle soru ödemesi için server endpoint
         const res = await fetch(`/api/payments/paddle/for-question/${questionId}`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({}) // şimdilik ek veri yok
         })
         const j = await res.json().catch(() => ({} as any))
         if (res.ok && j?.ok && j?.url) {
           // Sunucu aynı kredi akışında olduğu gibi /checkout/{orderId} döner
           return router.push(String(j.url))
         }
         // Fallback: başarısızsa mevcut akışa dön
       }
        // TRY vb. için mevcut akış
        return router.push(`/checkout/${questionId}`)
      } catch {
        // sessiz geç
      }
    })
  }

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
      <label className="flex items-start gap-2 text-sm select-none">
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
      <span>
  <a
    href="/dashboard/terms"
    target="_blank"
    rel="noopener noreferrer"
    className="underline"
  >
    {t.rich("terms.sections.approval.checkbox", {
      strong: (chunks) => <strong>{chunks}</strong>,
    })}
  </a>
</span>
      </label>

<div className="flex flex-col w-full gap-2 md:flex-row md:w-auto">
  <button
    onClick={proceed}
    disabled={!checked || busy}
    className="btn btn--primary text-sm h-10 px-4 disabled:opacity-50 whitespace-nowrap shrink-0 w-full md:w-auto"
    title={t("terms.client.goToPaymentTitle")}
  >
    {busy ? t("terms.client.redirecting") : t("terms.client.continue")}
  </button>

  <span className="w-full md:w-auto">
    {children}
  </span>
</div>

    </div>
  )
}