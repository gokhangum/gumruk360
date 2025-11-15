// app/admin/requests/Actions.tsx
'use client'

import { useState } from 'react'

type Props = { id: string; adminEmail: string }

export default function Actions({ id, adminEmail }: Props) {
  const [assignEmail, setAssignEmail] = useState('')
  const [answerStatus, setAnswerStatus] = useState('drafting')
  const [busy, setBusy] = useState<string | null>(null)

  const qs = `?email=${encodeURIComponent(adminEmail)}`

  async function call(path: string, body: any) {
    try {
      const res = await fetch(`${path}${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      return { ok: true as const, data: j?.data }
    } catch (err: any) {
      
      return { ok: false as const, error: err?.message || 'Bilinmeyen hata' }
    }
  }

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      alert('İnternet bağlantısı yok görünüyor. Bağlantıyı kontrol edip tekrar deneyin.')
      return
    }
    setBusy(label)
    const r = await fn()
    setBusy(null)
    if (!r.ok) {
      alert(`İşlem başarısız: ${r.error}`)
      return
    }
    // başarı → listeyi yenile
    location.reload()
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {/* Status */}
      <div className="flex gap-2">
        <button
          className="px-2 py-1 border rounded"
          disabled={!!busy}
          onClick={() =>
            run('approve', () => call(`/api/admin/questions/${id}/status`, { status: 'approved' }))
          }
        >
          {busy === 'approve' ? 'Onaylanıyor…' : 'Onayla'}
        </button>
        <button
          className="px-2 py-1 border rounded"
          disabled={!!busy}
          onClick={() =>
            run('reject', () => call(`/api/admin/questions/${id}/status`, { status: 'rejected' }))
          }
        >
          {busy === 'reject' ? 'Reddediliyor…' : 'Reddet'}
        </button>
        <button
          className="px-2 py-1 border rounded"
          disabled={!!busy}
          onClick={() =>
            run('paid', () => call(`/api/admin/questions/${id}/status`, { status: 'paid' }))
          }
        >
          {busy === 'paid' ? 'İşaretleniyor…' : 'Paid'}
        </button>
      </div>

      {/* Answer status */}
      <div className="flex gap-2 items-center">
        <select
          className="px-2 py-1 border rounded"
          value={answerStatus}
          onChange={(e) => setAnswerStatus(e.target.value)}
          disabled={!!busy}
        >
          <option value="drafting">drafting</option>
          <option value="in_review">in_review</option>
          <option value="sent">sent</option>
          <option value="completed">completed</option>
          <option value="reopened">reopened</option>
        </select>
        <button
          className="px-2 py-1 border rounded"
          disabled={!!busy}
          onClick={() =>
            run('answer', () =>
              call(`/api/admin/questions/${id}/answer-status`, { answer_status: answerStatus })
            )
          }
        >
          {busy === 'answer' ? 'Güncelleniyor…' : 'Set Answer'}
        </button>
      </div>

      {/* Claim */}
      <div className="flex gap-2">
        <button
          className="px-2 py-1 border rounded"
          disabled={!!busy}
          onClick={() =>
            run('claimApprove', () =>
              call(`/api/admin/questions/${id}/claim`, { action: 'approve' })
            )
          }
        >
          {busy === 'claimApprove' ? 'Onaylanıyor…' : 'Claim Onay'}
        </button>
        <button
          className="px-2 py-1 border rounded"
          disabled={!!busy}
          onClick={() =>
            run('claimReset', () =>
              call(`/api/admin/questions/${id}/claim`, { action: 'reset' })
            )
          }
        >
          {busy === 'claimReset' ? 'Sıfırlanıyor…' : 'Claim Reset'}
        </button>
      </div>

      {/* Assign */}
      <div className="flex gap-2 items-center">
        <input
          className="px-2 py-1 border rounded min-w-52"
          placeholder="calisan@firma.com"
          value={assignEmail}
          onChange={(e) => setAssignEmail(e.target.value)}
          disabled={!!busy}
        />
        <button
          className="px-2 py-1 border rounded"
          disabled={!!busy || !assignEmail}
          onClick={() =>
            run('assign', () =>
              // 🔧 API worker_email bekliyor
              call(`/api/admin/questions/${id}/assign`, { worker_email: assignEmail.trim() })
            )
          }
        >
          {busy === 'assign' ? 'Atanıyor…' : 'Assign'}
        </button>
      </div>
    </div>
  )
}
