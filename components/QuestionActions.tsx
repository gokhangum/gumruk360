"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
type Props = {
  id: string
  status: string | null
}

export default function QuestionActions({ id, status }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
const t = useTranslations('questionActions')
  const approved = status === "approved" || status === "paid"
  const rejected = status === "rejected"

  async function setStatus(next: "approved" | "rejected") {
    setErr(null)
    setBusy(next)
    try {
      const res = await fetch(`/api/ask/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || "status_update_failed")
      }

      if (next === "approved") {
        // Teklifi onayladı → ödeme safhasına geç
        router.push(`/checkout/${id}`)
      } else {
        router.refresh()
      }
    } catch (e: any) {
      setErr(e?.message || "unexpected_error")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setStatus("approved")}
          disabled={!!busy || approved}
          className={`px-3 py-2 rounded-lg border text-sm ${approved ? "opacity-60" : "hover:bg-gray-50"}`}
        >
          {busy === "approved" ? t('approving') : (approved ? t('approved') : t('approve'))}
        </button>
        <button
          onClick={() => setStatus("rejected")}
          disabled={!!busy || rejected}
          className={`px-3 py-2 rounded-lg border text-sm ${rejected ? "opacity-60" : "hover:bg-gray-50"}`}
        >
          {busy === "rejected" ? t('rejecting') : (rejected ? t('rejected') : t('reject'))}
        </button>

        {approved && (
          <button
            onClick={() => router.push(`/checkout/${id}`)}
            className="ml-2 px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
          >
            {t('goToPayment')}
          </button>
        )}
      </div>
      {err && <div className="text-xs text-red-600">{t('errorPrefix')}: {err}</div>}
      {approved && (
        <div className="text-xs text-gray-600">
          {t('approvedInfo')}
        </div>
      )}
    </div>
  )
}
