'use client'

import React, { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

type Props = { adminEmail: string, workers?: { id: string, name: string }[] }

export default function Filters({ adminEmail, workers }: Props) {
  const pathname = usePathname()
  const sp = useSearchParams()
  const formRef = useRef<HTMLFormElement>(null)

  // Arama alanı (debounce auto-submit)
  const [q, setQ] = useState(sp.get('s') ?? '')
  useEffect(() => {
    const t = setTimeout(() => {
      const current = sp.get('s') ?? ''
      if (current !== q) formRef.current?.requestSubmit()
    }, 500)
    return () => clearTimeout(t)
  }, [q, sp])

  // Varsayılanlar
  const dStatus   = sp.get('st')       ?? sp.get('status') ?? '' // <- önce st, sonra status
  const dAnswer   = sp.get('answer')   ?? ''
  const dClaim    = sp.get('claim')    ?? ''
  const dAssigned = sp.get('assigned') ?? 'any'
  const dUrgent   = sp.get('urgent')   ?? ''
  const dSort     = sp.get('sort')     ?? 'created_desc'

  const submitNow = () => formRef.current?.requestSubmit()

  return (
    <form ref={formRef} method="GET" action={pathname} className="border rounded p-3 flex flex-wrap gap-3 items-end">
      <input type="hidden" name="email" value={adminEmail} />

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 mb-1">Ara</label>
        <input
          name="s"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ID, başlık, açıklama…"
          className="border rounded px-2 py-1 min-w-64"
        />
      </div>

      {/* Status: artık st=... */}
      <div className="flex flex-col">
        <label className="text-xs text-gray-500 mb-1">Status</label>
        <select className="border rounded px-2 py-1" name="st" defaultValue={dStatus || ''} onChange={submitNow}>
          <option value="">Hepsi</option>
          <option value="submitted">submitted</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
          <option value="paid">paid</option>
        </select>
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 mb-1">Answer</label>
        <select className="border rounded px-2 py-1" name="answer" defaultValue={dAnswer} onChange={submitNow}>
          <option value="">Hepsi</option>
          <option value="drafting">drafting</option>
          <option value="in_review">in_review</option>
          <option value="completed">completed</option>
          <option value="sent">sent</option>
          <option value="reopened">reopened</option>
        </select>
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 mb-1">Claim</label>
        <select className="border rounded px-2 py-1" name="claim" defaultValue={dClaim} onChange={submitNow}>
          <option value="">Hepsi</option>
          <option value="none">none</option>
          <option value="pending">pending</option>
          <option value="approved">approved</option>
        </select>
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 mb-1">Atama</label>
        <select className="border rounded px-2 py-1" name="assigned" defaultValue={dAssigned} onChange={submitNow}>
          <option value="any">Hepsi</option>
          <option value="me">Bana atanmış</option>
          <option value="unassigned">Atanmamış</option>
        
          {workers?.length ? (<optgroup label="Çalışanlar">{workers.map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}</optgroup>) : null}
          </select>
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 mb-1">Acil</label>
        <select className="border rounded px-2 py-1" name="urgent" defaultValue={dUrgent} onChange={submitNow}>
          <option value="">Hepsi</option>
          <option value="1">Acil</option>
          <option value="0">Normal</option>
        </select>
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 mb-1">Sırala</label>
        <select className="border rounded px-2 py-1" name="sort" defaultValue={dSort} onChange={submitNow}>
          <option value="created_desc">Yeni → Eski</option>
          <option value="created_asc">Eski → Yeni</option>
          <option value="due_asc">Yakın SLA</option>
          <option value="due_desc">Uzak SLA</option>
        </select>
      </div>
    </form>
  )
}
