// components/payments/PaddleCheckoutOverlay.tsx
"use client"

import { useEffect, useRef, useState } from "react"

declare global {
  interface Window { Paddle?: any }
}

type Props = {
  transactionId?: string | null
  checkoutUrl?: string | null
  autoOpen?: boolean
  onClose?: () => void
  theme?: "light" | "dark" | "green"
}

export default function PaddleCheckoutOverlay({ transactionId, checkoutUrl, autoOpen = true, onClose, theme = "light" }: Props) {
  const [ready, setReady] = useState(false)
  const openedRef = useRef(false)

  useEffect(() => {
    async function ensureScript() {
      if (typeof window === "undefined") return
      try {
        document.querySelectorAll("iframe[name='paddle_frame']").forEach(n => n.parentElement?.removeChild(n))
      } catch {}
      if (!window.Paddle) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script")
          s.src = "https://cdn.paddle.com/paddle/v2/paddle.js"
          s.async = true
          s.onload = () => resolve()
          s.onerror = () => reject(new Error("paddle_js_failed"))
          document.head.appendChild(s)
        })
      }
    }
    async function init() {
      try {
        await ensureScript()
        if (!window.Paddle) throw new Error("paddle_js_missing")

        for (let i=0;i<5;i++) {
          try { window.Paddle.Environment.set("sandbox") } catch {}
          const cur = window.Paddle.Environment.get?.()
          if (cur === "sandbox") break
          await new Promise(r => setTimeout(r, 30))
        }
        console.log("[paddle] env:", window.Paddle.Environment.get?.())

        const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
        if (!token) throw new Error("client_token_missing (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN)");
        window.Paddle.Initialize({ token })
        window.Paddle.Update?.({ debug: true, eventCallback: (evt: any) => {
          try { console.log("[paddle:event]", evt?.name || evt, evt?.data || evt) } catch {}
        }})
        setReady(true)
      } catch (e) {
        console.error("[paddle] init failed:", e)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!autoOpen || !ready || openedRef.current) return
    openedRef.current = true

    try {
      const args: any = { settings: { theme } }
      if (transactionId) {
        args.transactionId = transactionId
        console.log("[paddle] opening with transactionId", transactionId)
      } else if (checkoutUrl) {
        args.url = checkoutUrl
        console.log("[paddle] opening with url", checkoutUrl)
      } else {
        console.error("[paddle] no checkoutUrl or transactionId provided")
        openedRef.current = false
        return
      }
      window.Paddle?.Checkout?.open?.(args)

      window.addEventListener("message", (evt) => {
        try {
          const data = typeof evt.data === "string" ? JSON.parse(evt.data) : evt.data
          if (data?.name === "checkout.failed") console.error("[paddle] checkout.failed payload:", data)
          if (data?.name === "checkout.closed") onClose?.()
        } catch {}
      })
    } catch (e) {
      console.error("[paddle] open failed, fallback redirect", e)
      if (checkoutUrl) window.open(checkoutUrl, "_blank", "noopener,noreferrer")
    }
  }, [ready, autoOpen, checkoutUrl, transactionId, onClose, theme])

  return null
}
