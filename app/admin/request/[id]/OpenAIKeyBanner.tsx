// app/admin/request/[id]/OpenAIKeyBanner.tsx
'use client'

import { useEffect, useState } from 'react'

export default function OpenAIKeyBanner() {
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/admin/openai-status')
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        setEnabled(!!j?.enabled)
      })
      .catch(() => setEnabled(false))
    return () => { alive = false }
  }, [])

  if (enabled === null) return null
  if (enabled) return null

  return (
    <div className="w-full text-center text-red-600 text-sm py-2">
      ( <strong>OPENAI_API_KEY</strong> tanımlı değil — GPT taslak üretimi devre dışı )
    </div>
  )
}
