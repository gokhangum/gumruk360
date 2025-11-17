'use client'
import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
type Scope = 'user' | 'org'

// --- Paddle overlay için minimal yardımcılar ---
declare global {
   interface Window { Paddle?: any }
 }
 async function ensurePaddleLoaded(clientToken: string) {
   if (typeof window === 'undefined') return
   if (!window.Paddle) {
    await new Promise<void>((resolve, reject) => {
     const s = document.createElement('script'); s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'; s.async = true
     s.onload = () => resolve(); s.onerror = () => reject(new Error('paddle_js_load_failed')); document.head.appendChild(s)
    })
   }
    const envRaw =
    (process.env.NEXT_PUBLIC_PADDLE_ENV as string) ||
     (process.env.PADDLE_ENV as string) ||
   'sandbox';
  const isLive = envRaw.toLowerCase() === 'live';
  try { window.Paddle?.Environment?.set?.(isLive ? 'production' : 'sandbox'); } catch {}

  // Token varsa initialize et (NEXT_PUBLIC_* olması gerekiyor)
   try { if (window.Paddle && clientToken) window.Paddle.Initialize({ token: clientToken }) } catch {}

 }
// --- /Paddle yardımcılar ---

export default function CheckoutPage() {
	const t = useTranslations('checkout')
const locale = useLocale()
  const [credits, setCredits] = useState<number>(0)
  const [scope, setScope] = useState<Scope>('user')
  const [unit, setUnit] = useState<number | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [ccy, setCcy] = useState<string>('USD')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
 const [started, setStarted] = useState(false)          // overlay açmayı denedik mi?
 const [retUrl, setRetUrl] = useState<string | null>(null)
 const [orderId, setOrderId] = useState<string | null>(null)
// .00 gibi gereksiz sıfırları gösterme
const nf4 = new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 4 })
const nf2 = new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const nf0 = new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const c = Number(q.get('credits') || 0)
    const s = (q.get('scope_type') === 'org') ? 'org' : 'user'
    setCredits(isFinite(c) && c > 0 ? c : 0)
    setScope(s)

    async function load() {
      try {
        const res = await fetch(`/api/public/subscription-settings/price?scope_type=${s}&credits=${c}`, { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || t('priceFetchFail'))
        setCcy(String(data?.currency || 'TRY').toUpperCase())
        const isTRY = String(data?.currency || 'TRY').toUpperCase() === 'TRY'
         setUnit(Number(isTRY ? (data?.unit_price_lira ?? 0) : (data?.unit_price_ccy ?? 0)))
         setTotal(Number(isTRY ? (data?.total_lira ?? 0)      : (data?.total_ccy ?? 0)))
      } catch (e:any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
     if (c > 0) load(); else setLoading(false)
   }, [])
   const router = useRouter()
 useEffect(() => {
   function onMsg(evt: MessageEvent) {
      try {
        const raw = evt.data
      const d = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return { raw } } })() : raw
      // Paddle farklı alan adları ile gelebiliyor
      const rawName = d?.name || d?.event || d?.type || d?.eventName || d?.action || ""
        const name = String(rawName).toLowerCase()
       const status = String(d?.status || d?.data?.status || "").toLowerCase()

       const isCompleted =
         name === "checkout.completed" ||
         status === "completed" ||
        (name.includes("checkout") && (name.includes("completed") || name.includes("complete") || name.includes("succeeded") || name.includes("success")))

       if (isCompleted) {
         // Önce state'teki orderId, yoksa retUrl'den yakala
          let oid = orderId
          if (!oid && retUrl) {
           const m = String(retUrl).match(/\/checkout\/([^/?#]+)/)
          if (m) oid = m[1]
          }
          router.replace(oid ? `/dashboard/orders/${oid}` : '/dashboard/orders')
} else if (name === "checkout.closed") {
  // Completed mesajı gelmese bile kullanıcıyı güvenli hedefe taşı
  if (orderId) {
    router.replace(`/dashboard/orders/${orderId}`)
  } else {
    // retUrl yoksa da orders listesine düş
    router.replace(retUrl || '/dashboard/orders')
  }
}

     } catch {}
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [scope, retUrl, orderId, router])



   async function goPay() {
     setSubmitting(true)
    setError(null)
    try {
if (ccy === 'USD') {
  // --- Paddle (USD) ---
  const res = await fetch('/api/payments/paddle/with-credits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credits,
      scope_type: scope,
      pricing_snapshot: { currency: ccy, unit_price_ccy: unit, total_ccy: total }
    })
  })
  const data = await res.json().catch(() => ({} as any))

  if (!res.ok || (!data?.url && !data?.data?.checkout_url && !data?.data?.transaction_id)) {
    setError(data?.error || t('paymentStartFail'))
    return
  }

  // Backend'in döndürdüğü /checkout/{orderId}?provider=paddle&txn=... URL'sini paddle'a özel sayfaya çevir
  const genericUrl = (data?.url as string) || null
  const txn = data?.data?.transaction_id || null
  if (genericUrl) {
    const m = genericUrl.match(/\/checkout\/([^/?#]+)/)
    const oid = m ? m[1] : null
    if (oid) {
      const paddleUrl = `/checkout/${oid}` + (txn ? `?provider=paddle&txn=${encodeURIComponent(txn)}` : '')

      window.location.href = paddleUrl
      return
    }
    // orderId çıkarılamazsa, emniyetli olarak generic URL'e git
    window.location.href = genericUrl
    return
  }

  // genericUrl yoksa, emniyetli fallback: Paddle hosted checkout
  if (data?.data?.checkout_url) {
    window.location.href = data.data.checkout_url
    return
  }

  setError(t('paymentStartFail'))
  return

} else {

         // --- PayTR (TRY) ---
        const res = await fetch('/api/payments/paytr/with-credits', {
         method: 'POST',
          headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ credits, scope_type: scope })
       })
        const data = await res.json()
      if (!res.ok || !data?.url) {
         setError(data?.error || t('paymentStartFail'))
        } else {
          window.location.href = data.url
         }
      }
    } catch (e) {
      setError(t('networkError'))
   } finally {
     setSubmitting(false)
    }
  }


  function back() {
    window.history.length > 1 ? window.history.back() :
      window.location.href = scope === 'org' ? '/dashboard/subscription' : '/dashboard/credits'
  }

  return (
       <div className="px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
         <div className="card-surface shadow-colored rounded-none md:rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
      <h1 className="text-xl font-semibold">{t('title')}</h1>

      <div className="card-surface p-4 space-y-4 edge-underline edge-blue edge-taper edge-rise-2mm">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="text-gray-500">{t('subscriptionType')}</div>
          <div className="font-medium">{scope === 'org' ? t('org') : t('user')}</div>
          <div className="text-gray-500">{t('creditsToBuy')}</div>
          <div className="font-medium">{nf4.format(credits)}</div>
          <div className="text-gray-500">{t('unitPrice')} ({ccy})</div>
                   <div className="font-medium">
           {loading ? '—' : (unit != null ? nf4.format(unit) : '—')} {ccy}
            </div>
         <div className="text-gray-500">{t('totalPayable')} ({ccy})</div>
        <div className="font-semibold text-lg">
               {loading ? '—' : (total != null ? nf0.format(Math.floor(total)) : '—')} {ccy}
            </div>
        </div>

        {(!started && error) && <div className="text-sm text-red-600" role="alert">{error}</div>}
	        {/* Ödeme öncesi bilgilendirme (docx) */}
         <div className="mt-2 prose prose-sm max-w-none text-gray-700">
          <h2 className="!mt-0">{t('info.title')}</h2>
           <ul>
            <li>{t('info.li1')}</li>
             <li>{t('info.li2')}</li>
           <li>{t('info.li3')}</li>
           <li>{t('info.li4')}</li>
            <li>{t('info.li5')}</li>
            <li>{t('info.li6')}</li>
           <li>{t('info.li7')}</li>
             <li>
              {t('info.li8')}{' '}
              <Link href="/dashboard/terms" className="underline underline-offset-2">
                {t('info.tos')}
             </Link>
             </li>
          </ul>
        </div>

        <div className="flex items-center gap-3">

         <button onClick={back} className="btn btn--ghost">{t('back')}</button>

          <button
            onClick={goPay}
            disabled={loading || submitting || !credits || (unit == null) || (total == null)}
            className={"btn btn--primary btn--cta " + ((loading || submitting || !credits || (unit == null) || (total == null)) ? "opacity-60 pointer-events-none" : "")}
          >
            {submitting ? t('redirecting') : t('goToPayment')}

          </button>
        </div>

       <p className="text-xs text-gray-500">
  {t('redirectNote')}
</p>
      </div>
    </div>
	    </div>  
  </div>   
     
  )
}
