// app/(dashboard)/checkout/[id]/return/page.tsx
"use client"

import { useSearchParams, useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl";
export default function CheckoutReturnPage() {
  const sp = useSearchParams()
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
const t = useTranslations("checkoutReturn")
  const status = sp.get("status") || "success"
  const orderId = (sp.get("orderId") || id) as string // query'den al, yoksa path

  // 5 sn sayaç
  const [seconds, setSeconds] = useState(5)

  const targetHref = useMemo(() => `/dashboard/orders/${orderId}`, [orderId])

  // SAYAÇ: sadece azalt, yönlendirmeyi burada yapma!
  useEffect(() => {
    if (status !== "success" || !orderId) return
    setSeconds(5) // her girişte reset
    const t = setInterval(() => {
      // sadece state güncelle — yan etki yok
      setSeconds((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(t)
  }, [status, orderId])

  // YÖNLENDİRME: sayaç 0 olduğunda ve başarı durumunda
  useEffect(() => {
    if (status !== "success" || !orderId) return
    if (seconds === 0) {
      router.replace(targetHref) // render dışında, güvenli
    }
  }, [seconds, status, orderId, router, targetHref])

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-2">{t("title")}</h1>
      {status === "success" ? (
        <>
          <p className="mb-2">{t("success")}</p>
          <p className="mb-4 text-sm text-gray-600">
            {seconds > 0
             ? t("redirectCountdown", { seconds })
			: t("redirecting")}
          </p>
          <a className="underline" href={targetHref}>{t("goToOrder")}</a>
        </>
      ) : (
        <>
          <p className="mb-4">{t("fail")}</p>
          <a className="underline" href={`/checkout/${orderId}`}>{t("retry")}</a>
        </>
      )}
    </div>
  )
}
