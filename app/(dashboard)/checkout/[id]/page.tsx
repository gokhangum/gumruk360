// app/checkout/[id]/page.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl";
 // --- Paddle overlay yardımcıları ---
 declare global { interface Window { Paddle?: any } }
  async function ensurePaddleLoaded(clientToken?: string) {
    if (typeof window === 'undefined') return
    // 1) SDK yükle
    if (!window.Paddle) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'
        s.async = true
        s.onload = () => resolve()
        s.onerror = () => reject(new Error('paddle_js_load_failed'))
        document.head.appendChild(s)
      })
    }
    // 2) Ortamı sabitle (sandbox/live)
    const envRaw =
      (process.env.NEXT_PUBLIC_PADDLE_ENV as string) ||
      (process.env.PADDLE_ENV as string) ||
      'sandbox'
    const isLive = envRaw.toLowerCase() === 'live'
    try { window.Paddle?.Environment?.set(isLive ? 'production' : 'sandbox') } catch {}
    // 3) Doğru client token seç
    const token =
      clientToken ||
      (isLive
        ? ((process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_LIVE as string) || (process.env.PADDLE_CLIENT_TOKEN_LIVE as string) || '')
        : ((process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN as string) || (process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_SANDBOX as string) || (process.env.PADDLE_CLIENT_TOKEN as string) || (process.env.PADDLE_CLIENT_TOKEN_SANDBOX as string) || ''))
    if (!token) throw new Error('paddle_client_token_missing')
    // 4) Initialize (idempotent)
    if (!window.Paddle?.Status?.isInitialized) {
      window.Paddle.Initialize({ token })
      window.Paddle.Update?.({ debug: true })
    }
  }

export default function CheckoutPage() {
  const { id } = useParams<{ id: string }>()
  const sp = useSearchParams()
const t = useTranslations("checkoutPage")
  const overrideEmail = sp.get("email") || undefined
  const overrideAmount = sp.get("amount") ? Number(sp.get("amount")) : undefined
  const overrideCurrency = sp.get("currency") || undefined
  const provider = sp.get("provider") || undefined
  const txn = sp.get("txn") || undefined
  const [orderId, setOrderId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)

  // window yerine BASE kullan (SSR güvenli)
  const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
  const return_url = `${BASE}/checkout/${orderId || id}/return`
  const cancel_url = `${BASE}/checkout/${orderId || id}/cancel`
    // Paddle ödeme tamamlandığında webhook beklemeden ilerlemek için watcher
  const watcherRef = useRef<number | null>(null)
  function startPaddleWatcher(oid: string) {
    if (watcherRef.current != null) return
    watcherRef.current = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/orders/${oid}/status`, { cache: "no-store" })
        const j = await r.json().catch(() => ({} as any))
        if (r.ok && j?.ok && (j.status === "paid" || j.status === "succeeded" || j.status === "completed")) {
          if (watcherRef.current != null) { clearInterval(watcherRef.current); watcherRef.current = null }
          window.location.href = `/dashboard/orders/${oid}`
        }
      } catch {
        // sessiz geç
      }
    }, 2000)
  }
// watcher temizliği – top-level useEffect
useEffect(() => {
  return () => {
    if (watcherRef.current != null) {
      clearInterval(watcherRef.current)
      watcherRef.current = null
    }
  }
}, [])


  useEffect(() => {
    ;(async () => {
      try {
       // --- USD/Paddle akışı: PayTR initiate çağrısını atla, overlay'i aç ---
        if ((provider || "").toLowerCase() === "paddle" && txn) {
        await ensurePaddleLoaded() // token & env içeriden seçiliyor
        // Popup engelleyicilere takılmaması için void ile çağır
         try {
			           // Overlay tamamlandı eventi: watcher'ı garantiye almak için
          try {
window.Paddle?.Events?.on?.("checkout.completed", () => {
  window.location.href = `/dashboard/orders/${id}`
})
window.Paddle?.Events?.on?.("checkout.closed", () => {
  window.location.href = `/dashboard/orders/${id}`
})

          } catch {}

           void window.Paddle.Checkout.open({ transactionId: txn, settings: { theme: "light" } })
         } catch (e) {
           // Overlay açılamazsa sessiz düş
         }
          setOrderId(id)        // return/cancel linkleri için
		  startPaddleWatcher(String(id))
          setError(null); setDetail(null)
          return                // PayTR akışına girmeden çık

        }

        // NOT: amount/currency/email kök seviyede gönderiliyor
        const body = {
          id, // questionId ya da orderId olabilir
          amount: overrideAmount,          // kuruş; yoksa backend pending order arar/oluşturur
          currency: overrideCurrency,      // opsiyonel
          email: overrideEmail,            // opsiyonel
          return_url,
          cancel_url,
        }

        const r = await fetch("/api/payments/paytr/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })

        const data = await r.json()
        if (!r.ok || !data.ok) {
          setError(data?.error || "init_failed")
          setDetail(data?.detail || null)
          return
        }
        setOrderId(data.orderId)
        setToken(data.token)
        setError(null)
        setDetail(null)
      } catch (e: any) {
        setError(e?.message || ((provider||"").toLowerCase()==="paddle" ? "paddle_init_failed" : "init_failed"))
        setDetail(null)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, overrideEmail, overrideAmount, overrideCurrency, provider, txn])


  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">{t("error.title")}</h1>
        <p className="text-red-600">{String(error)}</p>
        {detail && (
          <pre className="mt-2 text-xs bg-red-50 p-2 rounded border overflow-auto">
            {detail}
          </pre>
        )}
        {/* Gerekirse manuel deneme için küçük ipucu */}
        {!overrideAmount && (
          <p className="mt-3 text-xs text-gray-500">
            {t.rich("error.testHint", {
              amount: 240000,
              // Çeviri içindeki <code>...</code> için rich wrapper şart
              code: (chunks) => <code>{chunks}</code>,
            })}
          </p>
        )}

      </div>
    )
  }

  if ((provider || "").toLowerCase() === "paddle" && txn) {
    // Overlay açıldı; PAYTR token'ı beklemeyelim
    return (
      <div className="p-6">
       <h1 className="text-xl font-semibold mb-2">{t("title")}</h1>
        <p>{t("redirectingPaddle")}</p>
      </div>
    )
 }
  if (!token) {
    return (
     <div className="p-6">
       <h1 className="text-xl font-semibold mb-2">{t("loading.title")}</h1>
        <p>{t("loading.wait")}</p>
      </div>
    )
  }


  const isMock = token.startsWith("mock_") || token.startsWith("MOCK_")
  const finalOrderId = orderId || id

  async function mockSuccess() {
    try {
      // Yerel geliştirme: DB'de gerçek "paid" oluştur
      await fetch("/api/payments/mock/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: finalOrderId }),
      })
    } catch {}
    window.location.href = `/dashboard/orders/${finalOrderId}`
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">{t("title")}</h1>

      {isMock ? (
        <div className="rounded-xl border p-6">
          <p className="mb-4">{t("mock.info")}</p>
          <button
            className="rounded-xl px-4 py-2 border shadow"
            onClick={mockSuccess}
          >
            {t("mock.successBtn")}
          </button>
          <button
            className="rounded-xl px-4 py-2 border shadow ml-2"
            onClick={() => {
              window.location.href = `/checkout/${finalOrderId}/cancel?orderId=${finalOrderId}`
            }}
          >
            {t("cancel")}
          </button>
        </div>
      ) : (
        <iframe
          title="PAYTR"
          src={`https://www.paytr.com/odeme/guvenli/${token}`}
          frameBorder={0}
   scrolling="auto"
   style={{ width: "100%", height: "100dvh", minHeight: 800, display: "block", borderRadius: 16, border: "1px solid #e5e7eb" }}       
          
        />
      )}
    </div>
  )
}
