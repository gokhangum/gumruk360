'use client'
// app/auth/debug/page.tsx
import { useEffect, useState } from 'react'

export default function AuthDebugPage() {
  const [cookiesText, setCookiesText] = useState('')
  const [whoami, setWhoami] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setCookiesText(document.cookie || '(no document.cookie)')
    ;(async () => {
      try {
        const r = await fetch('/api/auth/whoami', { cache: 'no-store' })
        const j = await r.json()
        setWhoami(j)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Auth Debug</h1>
      <div className="space-y-2">
        <h2 className="font-semibold">document.cookie</h2>
        <pre className="p-3 border rounded bg-gray-50 whitespace-pre-wrap break-all">{cookiesText}</pre>
      </div>
      <div className="space-y-2">
        <h2 className="font-semibold">/api/auth/whoami (server sees)</h2>
        {loading ? <div>Loading…</div> : <pre className="p-3 border rounded bg-gray-50 whitespace-pre-wrap break-all">{JSON.stringify(whoami, null, 2)}</pre>}
      </div>
      <p className="text-sm text-gray-600">Bittiğinde bu sayfayı kaldırabilirsiniz.</p>
    </div>
  )
}
