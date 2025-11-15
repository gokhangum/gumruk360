'use client'

import React, { useEffect, useMemo, useState } from 'react'

type Props = {
  createdAt: string | null
  slaDueAt: string | null
  isUrgent: boolean | null
  estDaysNormal: number | null
  estDaysUrgent: number | null
}

function fmt(d: Date) { return d.toLocaleString('tr-TR') }
function addDays(d: Date, days: number) { const x = new Date(d); x.setDate(x.getDate() + days); return x }
function human(ms: number) {
  const neg = ms < 0; ms = Math.abs(ms)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  let out = ''
  if (h >= 24) {
    const d = Math.floor(h / 24)
    out = `${d}g`
  } else if (h > 0) {
    out = `${h}s` // saat
  } else if (m > 0) {
    out = `${m}d` // dakika
  } else {
    out = `${s}s`
  }
  return neg ? `-${out}` : out
}

export default function SlaBadge({
  createdAt,
  slaDueAt,
  isUrgent,
  estDaysNormal,
  estDaysUrgent
}: Props) {
  // Hydration uyumu: İlk render’da dinamik zaman yazmayalım (—), mount sonrası güncelleyelim.
  const [mounted, setMounted] = useState(false)
  const [now, setNow] = useState<number>(0)

  useEffect(() => {
    setMounted(true)
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000) // saniyelik güncelleme
    return () => clearInterval(id)
  }, [])

  const dueAt = useMemo(() => {
    try {
      if (slaDueAt) {
        const d = new Date(slaDueAt)
        return Number.isFinite(d.getTime()) ? d : null
      }
      if (!createdAt) return null
      const base = new Date(createdAt)
      if (!Number.isFinite(base.getTime())) return null
      const days = (isUrgent ? (estDaysUrgent ?? 1) : (estDaysNormal ?? 1)) ?? 1
      return addDays(base, Number(days))
    } catch { return null }
  }, [createdAt, slaDueAt, isUrgent, estDaysNormal, estDaysUrgent])

  const { label, tone } = useMemo(() => {
    if (!dueAt || !mounted || !now) {
      return { label: '—', tone: 'muted' as const }
    }
    const msLeft = dueAt.getTime() - now
    let tone: 'ok' | 'warn' | 'crit' | 'muted' = 'ok'
    // Eşikler: < 6 saat => crit, < 12 saat => warn (talebindeki renk mantığıyla uyumlu)
    if (msLeft < 0) tone = 'crit'
    else if (msLeft <= 6 * 3600000) tone = 'crit'
    else if (msLeft <= 12 * 3600000) tone = 'warn'
    const label = human(msLeft)
    return { label, tone }
  }, [dueAt, mounted, now])

  const cls =
    tone === 'ok'   ? 'bg-green-50 text-green-700' :
    tone === 'warn' ? 'bg-yellow-50 text-yellow-800' :
    tone === 'crit' ? 'bg-red-50 text-red-700' :
                      'bg-gray-100 text-gray-500'

  // İlk render’da title vermeyelim ki SSR <> Client farkı oluşmasın
  const title = mounted && dueAt ? `SLA: ${fmt(dueAt)}` : undefined

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${cls}`} title={title}>
      <span>⏳</span>
      <span suppressHydrationWarning>{label}</span>
    </span>
  )
}
