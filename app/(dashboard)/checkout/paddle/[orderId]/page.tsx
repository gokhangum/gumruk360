// app/(dashboard)/checkout/paddle/[orderId]/page.tsx
'use client'

import { use, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { pushEvent } from "@/lib/datalayer"
declare global {
  interface Window { Paddle?: any }
}

async function ensurePaddleLoaded(clientToken: string) {
  if (typeof window === 'undefined') return
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
  const envRaw =
    (process.env.NEXT_PUBLIC_PADDLE_ENV as string) ||
     (process.env.PADDLE_ENV as string) ||
     "sandbox";
   const isLive = envRaw.toLowerCase() === "live";
 try { window.Paddle?.Environment?.set?.(isLive ? "production" : "sandbox"); } catch {}
   try { if (window.Paddle && clientToken) window.Paddle.Initialize({ token: clientToken }) } catch {}

}

type StatusKind = 'idle' | 'opening' | 'success' | 'closed' | 'canceled' | 'failed' | 'error'

export default function PaddleCheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {

  const router = useRouter()
  const search = useSearchParams()
const { orderId } = use(params)
const t = useTranslations('dashboard.checkout.paddle')

  const [status, setStatus] = useState<StatusKind>('idle')
  const [message, setMessage] = useState<string>(t('msg_redirecting'))
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number>(3)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const clientToken = useMemo(
    () =>
      (process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN as string) ||
      (process.env.PADDLE_CLIENT_TOKEN as string) ||
      '',
    []
  )

  const provider = (search.get('provider') || 'paddle').toLowerCase()
  const txnParam = search.get('txn') || ''

  const targetOnSuccess = useMemo(() => `/dashboard/orders/${orderId}`, [orderId])
  const targetOnClose = useMemo(() => `/dashboard/orders/${orderId}`, [orderId])
  const targetOnCancel = useMemo(() => `/dashboard/orders/${orderId}?status=cancelled`, [orderId])
  const targetOnFail = useMemo(() => `/dashboard/orders/${orderId}?status=failed`, [orderId])

  // --- Order status watcher: backend "paid/completed" olduğunda yönlendir ---
  const watcherRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [watching, setWatching] = useState(false)

  const startStatusWatcher = (oid: string, txn?: string) => {
    if (!oid) return
    if (watcherRef.current) clearTimeout(watcherRef.current)
    setWatching(true)

    const startedAt = Date.now()
    const tick = async () => {
      try {
        // Var olan resolve endpoint’i kullanıyoruz (daha önce sayfada da çağırıyorduk)
        const qs = txn ? `&txn=${encodeURIComponent(txn)}` : ''
        const res = await fetch(`/api/public/orders/resolve?provider=paddle&orderId=${encodeURIComponent(oid)}${qs}`, { cache: 'no-store' })
        const j = await res.json().catch(() => ({} as any))

        // Olası alanlar: status, paid, is_paid, payment_status
        const status = String(j?.status || j?.payment_status || '').toLowerCase()
        const paid =
          j?.paid === true || j?.is_paid === true ||
          status === 'paid' || status === 'completed' || status === 'success'

        if (paid) {
          setStatus('success')
          setMessage(t('msg_success_redirect'))
          startCountdown(targetOnSuccess)
          return
        }
      } catch {}

      // 2 dk’ya kadar dene
      if (Date.now() - startedAt < 120_000) {
        watcherRef.current = setTimeout(tick, 2000)
      } else {
        setWatching(false)
      }
    }
    tick()
  }


  // 3 sn geri sayım ve yönlendirme
  const startCountdown = (to: string) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setCountdown(3)
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current as any)
          window.location.href = to
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  // Paddle overlay’i aç
  const openPaddle = async (txn?: string, checkoutUrl?: string) => {
    setStatus('opening')
    setMessage(t('msg_opening_modal'))

    try {
      await ensurePaddleLoaded(clientToken)

      // Event’ler
      const onCompleted = () => {
		   // GA4 payment_success event
    try {
        const host = typeof window !== "undefined" ? window.location.hostname : ""
        const tenant = host.includes("easycustoms360") ? "easycustoms360" : "gumruk360"
        const locale = tenant === "easycustoms360" ? "en-US" : "tr-TR"

        pushEvent("payment_success", {
            tenant,
            locale,
            order_id: orderId,   // mevcut parametre
        })
    } catch {}
        setStatus('success')
        setMessage(t('msg_success_redirect'))
        startCountdown(targetOnSuccess)
      }
      const onClosed = () => {
        // overlay X ile kapatıldı
        setStatus('closed')
        setMessage(t('msg_closed_redirect'))
        startCountdown(targetOnClose)
      }
      const onFailed = () => {
        setStatus('failed')
        setMessage(t('msg_failed_redirect'))
        startCountdown(targetOnFail)
      }

      // Güvenli bind
      try {
        window.Paddle?.Events?.on?.('checkout.completed', onCompleted)
        window.Paddle?.Events?.on?.('checkout.closed', onClosed)
        window.Paddle?.Events?.on?.('checkout.failed', onFailed)
      } catch {}

      // PostMessage fallback (bazı ortamlarda event isimleri farklı düşebilir)
      const onMsg = (evt: MessageEvent) => {
        try {
          const raw = evt.data
          const d = typeof raw === 'string' ? JSON.parse(raw) : raw
          const rawName = d?.name || d?.event || d?.type || d?.eventName || d?.action || ''
          const name = String(rawName).toLowerCase()
          const wasCompleted =
            name === 'checkout.completed' ||
            (name.includes('checkout') &&
              (name.includes('completed') || name.includes('success') || name.includes('succeeded')))

          const wasCanceled = name.includes('cancel') || name.includes('canceled') || name.includes('cancelled')
          const wasClosed = name.includes('closed') || name === 'checkout.closed'
          const wasFailed = name.includes('fail') || name === 'checkout.failed'

          if (wasCompleted) {
            onCompleted()
          } else if (wasCanceled) {
            setStatus('canceled')
            setMessage(t('msg_canceled_redirect'))
            startCountdown(targetOnCancel)
          } else if (wasClosed) {
            onClosed()
          } else if (wasFailed) {
            onFailed()
          }
        } catch {}
      }
      window.addEventListener('message', onMsg)

      // Overlay aç
      if (txn && window.Paddle?.Checkout?.open) {
        await window.Paddle.Checkout.open({ transactionId: txn })
      } else if (checkoutUrl && window.Paddle?.Checkout?.open) {
        await window.Paddle.Checkout.open({ url: checkoutUrl })
      } else if (checkoutUrl) {
        // Paddle objesi yoksa en azından hosted checkout’a gidelim
        window.location.href = checkoutUrl
      } else {
        throw new Error('overlay_open_failed')
      }
    } catch (e: any) {
      setStatus('error')
      setError(e?.message || t('err_open_modal'))
      setMessage(t('msg_error_redirect'))
      startCountdown(targetOnFail)
    }
  }

  // İlk yüklemede txn varsa doğrudan aç; yoksa resolve etmeyi dene
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (provider !== 'paddle') {
          // Yanlışlıkla buraya geldiyse bile sipariş sayfasına dön
          startCountdown(targetOnClose)
          return
        }

        setStatus('opening')
        setMessage(t('msg_starting_payment'))

        const txn = txnParam?.trim()
        if (txn) {
          if (!cancelled) await openPaddle(txn)
          return
        }

        // txn yoksa backend’den çöz (varsa kendi endpoint’ini kullan)
        // /api/public/orders/resolve?provider=paddle&orderId=...
        const res = await fetch(`/api/public/orders/resolve?provider=paddle&orderId=${encodeURIComponent(orderId)}`, { cache: 'no-store' })
        const j = await res.json().catch(() => ({} as any))

        const resolvedTxn: string | undefined = j?.transaction_id || j?.txn || j?.transactionId
        const checkoutUrl: string | undefined = j?.checkout_url || j?.url

        if (resolvedTxn || checkoutUrl) {
          if (!cancelled) await openPaddle(resolvedTxn, checkoutUrl)
          return
        }

        throw new Error('transaction_not_found')
      } catch (e: any) {
        if (cancelled) return
        setStatus('error')
        setError(e?.message || 'transaction_resolve_failed')
        setMessage(t('msg_txn_not_found_redirect'))
        startCountdown(targetOnFail)
      }
    })()

    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
      try { window.Paddle?.Events?.off?.('checkout.completed') } catch {}
      try { window.Paddle?.Events?.off?.('checkout.closed') } catch {}
      try { window.Paddle?.Events?.off?.('checkout.failed') } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, provider])

  const statusColor =
    status === 'success' ? 'text-green-600'
      : status === 'failed' ? 'text-red-600'
      : status === 'canceled' ? 'text-amber-600'
      : status === 'closed' ? 'text-slate-600'
      : status === 'error' ? 'text-red-600'
      : 'text-sky-700'

  const targetByStatus =
    status === 'success' ? targetOnSuccess
      : status === 'canceled' ? targetOnCancel
      : status === 'failed' ? targetOnFail
      : targetOnClose

  return (
    <div className="bg-gradient-to-b from-white to-slate-50 py-6">
      <div className="w-full max-w-none md:max-w-[clamp(320px,90vw,960px)] mx-auto px-4 md:px-6">
        <div className="card-surface shadow-colored p-6 md:p-8 space-y-6">
          <h1 className="text-xl font-semibold">{t('title')}</h1>

          <div className="text-sm">
            <div className={`font-medium ${statusColor}`}>
              {message}
              {(status === 'success' || status === 'closed' || status === 'canceled' || status === 'failed' || status === 'error') && (
                <> ({countdown})</>
              )}
            </div>
            {error && <div className="mt-2 text-red-600 break-words">{String(error)}</div>}
          </div>

          <div className="flex items-center gap-3">
            <Link href={targetByStatus} className="btn btn--ghost">
            {t('go_now')}
            </Link>
            <Link href={`/dashboard/orders/${orderId}`} className="btn btn--primary">
              {t('order_detail')}
            </Link>
          </div>

          <div className="text-xs text-slate-500">
  {t('order_no')}: <span className="font-mono">{orderId}</span>
  {txnParam ? <> • {t('txn_no')}: <span className="font-mono">{txnParam}</span></> : null}
</div>

        </div>
      </div>
    </div>
  )
}
