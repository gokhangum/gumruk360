'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { adminApi } from '@/lib/adminApi'

type Row = {
  id: string
  question_id: string
  revision_no: number | null
  version?: number | null
  summary?: string | null
  source?: string | null
  created_by?: string | null
  created_at?: string | null
  content?: string | null
}

function revNo(r?: Row | null) {
  if (!r) return null
  return typeof r.revision_no === 'number' ? r.revision_no : r.version ?? null
}

function fmtDate(s?: string | null) {
  if (!s) return '—'
  try {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toLocaleString()
  } catch {
    return s
  }
}

export default function RevisionsPage() {
  // Next 15: client component'ta dinamik segment için useParams kullan
  const params = useParams() as { id: string }
  const questionId = params.id

  const sp = useSearchParams()
  const adminEmail = sp.get('email') || ''

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string>('')

  // üst çubuk mesajı (taslağı revizyona çevir)
  const [topMsg, setTopMsg] = useState<string>('')

  // seçimler
  const [left, setLeft] = useState<Row | null>(null)
  const [right, setRight] = useState<Row | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (revNo(b) ?? 0) - (revNo(a) ?? 0)),
    [rows]
  )

  const leftIdx = useMemo(() => (left ? sorted.findIndex(r => r.id === left.id) : -1), [left, sorted])
  const rightIdx = useMemo(() => (right ? sorted.findIndex(r => r.id === right.id) : -1), [right, sorted])

  // Listeyi yükle — Row[] döner ki revert sonrası en günceli seçebilelim
  async function loadList(): Promise<Row[]> {
    setLoading(true)
    setErr('')
    setTopMsg('')
    try {
      const url = new URL(adminApi.listRevisions(questionId), location.origin)
      if (adminEmail) url.searchParams.set('email', adminEmail)
      const res = await fetch(url.toString())
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.ok) {
        setErr(String(json?.error || 'Liste yüklenemedi'))
        setRows([])
        return []
      }
      const data = Array.isArray(json.data) ? json.data : []
      const norm: Row[] = data.map((r: any) => ({
        id: String(r.id),
        question_id: String(r.question_id),
        revision_no:
          typeof r.revision_no === 'number' ? r.revision_no :
          typeof r.version === 'number' ? r.version : null,
        version:
          typeof r.version === 'number' ? r.version :
          typeof r.revision_no === 'number' ? r.revision_no : null,
        summary: r.summary ?? (r.content ? String(r.content).replace(/\s+/g, ' ').trim().slice(0, 160) : ''),
        source: r.source ?? null,
        created_by: r.created_by ?? null,
        created_at: r.created_at ?? null,
        content: typeof r.content === 'string' ? r.content : null,
      }))
      setRows(norm)
      if (left && !norm.find(x => x.id === left.id)) setLeft(null)
      if (right && !norm.find(x => x.id === right.id)) setRight(null)
      return norm
    } catch (e: any) {
      setErr(String(e?.message || 'Liste yüklenemedi'))
      setRows([])
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId])

  // Tek revizyon içeriği
  async function fetchOne(idOrNo: string): Promise<Row | null> {
    try {
      const isNum = /^\d+$/.test(idOrNo)
      const url = new URL(adminApi.listRevisions(questionId), location.origin)
      if (adminEmail) url.searchParams.set('email', adminEmail)
      if (isNum) url.searchParams.set('no', idOrNo)
      else url.searchParams.set('rid', idOrNo)
      const res = await fetch(url.toString())
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.ok || !json?.data) return null
      const r = json.data as any
      return {
        id: String(r.id),
        question_id: String(r.question_id),
        revision_no:
          typeof r.revision_no === 'number' ? r.revision_no :
          typeof r.version === 'number' ? r.version : null,
        version:
          typeof r.version === 'number' ? r.version :
          typeof r.revision_no === 'number' ? r.revision_no : null,
        summary: r.summary ?? (r.content ? String(r.content).replace(/\s+/g, ' ').trim().slice(0, 160) : ''),
        source: r.source ?? null,
        created_by: r.created_by ?? null,
        created_at: r.created_at ?? null,
        content: typeof r.content === 'string' ? r.content : '',
      }
    } catch {
      return null
    }
  }

  // Liste satırı butonları
  async function pickLeft(r: Row) {
    setDiffLoading(true)
    setLeft(await fetchOne(r.id))
    setDiffLoading(false)
  }
  async function pickRight(r: Row) {
    setDiffLoading(true)
    setRight(await fetchOne(r.id))
    setDiffLoading(false)
  }

  // Geri al: başarılı olunca listeyi tazele + en günceli sola yükle
  async function revertFromRow(r: Row) {
    const no = revNo(r)
    const label = no != null ? `#${no}` : r.id
    if (!confirm(`Bu revizyondan geri almak istediğine emin misin? (${label})`)) return
    const url = new URL(adminApi.revert(questionId, r.id), location.origin)
    if (adminEmail) url.searchParams.set('email', adminEmail)
    const res = await fetch(url.toString(), { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    if (!json?.ok) {
      alert(`Geri alma başarısız: ${json?.error || 'Bilinmeyen hata'}`)
      return
    }
    const newRows = await loadList()
    const top = [...newRows].sort((a, b) => (revNo(b) ?? 0) - (revNo(a) ?? 0))[0]
    if (top) {
      const full = await fetchOne(top.id)
      setLeft(full) // en güncel revizyon sol panelde
    }
    alert(`Geri alındı. Yeni draft versiyonu: ${json?.version ?? '-'} • En güncel revizyon yüklendi.`)
  }

  // Üst çubuk: sayfa yenile / liste tazele / editöre dön / taslağı revizyona çevir
  function reloadPage() { location.reload() }
  async function refreshList() { await loadList() }
  async function ingestDraft() {
    try {
      setTopMsg('')
      const url = new URL(adminApi.ingestDraft(questionId), location.origin)
      if (adminEmail) url.searchParams.set('email', adminEmail)
      const res = await fetch(url.toString(), { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!json?.ok) {
        setTopMsg(String(json?.error || 'revision not found'))
        return
      }
      setTopMsg('Taslak revizyona çevrildi.')
      await loadList()
    } catch (e: any) {
      setTopMsg(String(e?.message || 'İşlem başarısız'))
    }
  }

  // Alt kontrol çubuğu
  function swapSelections() {
    setLeft(prev => { const L = prev; setRight(L); return right })
  }
  function clearLeft() { setLeft(null) }
  function clearRight() { setRight(null) }
  async function copyLeft() { try { await navigator.clipboard.writeText(left?.content || '') } catch {} }
  async function copyRight() { try { await navigator.clipboard.writeText(right?.content || '') } catch {} }
  async function revertLeft() { if (left) await revertFromRow(left) }
  async function revertRight() { if (right) await revertFromRow(right) }
  async function navigate(which: 'left' | 'right', dir: -1 | 1) {
    const idx = which === 'left' ? leftIdx : rightIdx
    if (idx < 0) return
    const next = sorted[idx + dir]
    if (!next) return
    const full = await fetchOne(next.id)
    if (which === 'left') setLeft(full); else setRight(full)
  }

  const leftLabel = useMemo(() => (revNo(left) != null ? `Sol (#${revNo(left)})` : 'Sol'), [left])
  const rightLabel = useMemo(() => (revNo(right) != null ? `Sağ (#${revNo(right)})` : 'Sağ'), [right])

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Revizyonlar</h1>

      {/* ÜST 4 BUTON */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={reloadPage} className="border rounded px-3 py-1.5 text-sm">Sayfayı Yenile</button>
        <button onClick={() => void refreshList()} className="border rounded px-3 py-1.5 text-sm">Listeyi Tazele</button>
        <Link href={`/admin/request/${questionId}?email=${encodeURIComponent(adminEmail)}`} className="border rounded px-3 py-1.5 text-sm">Editöre Dön</Link>
        
        {topMsg && (<span className={/başarısız|not found|hata/i.test(topMsg) ? 'text-red-600 text-sm' : 'text-green-700 text-sm'}>{topMsg}</span>)}
      </div>

      {err && <div className="border border-red-300 bg-red-50 text-red-700 p-2 rounded text-sm">{err}</div>}

      {/* LİSTE */}
      <section className="border rounded">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2">No</th>
                <th className="text-left px-3 py-2">Özet</th>
                <th className="text-left px-3 py-2">Kaynak</th>
                <th className="text-left px-3 py-2">Tarih</th>
                <th className="text-left px-3 py-2">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-3 py-2" colSpan={5}>Yükleniyor…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td className="px-3 py-2" colSpan={5}>Henüz revizyon yok</td></tr>
              ) : (
                sorted.map((r) => {
                  const no = revNo(r)
                  const isLeft = !!left && r.id === left.id
                  const isRight = !!right && r.id === right.id
                  const rowHighlight =
                    isLeft && isRight ? 'bg-purple-50' :
                    isLeft ? 'bg-blue-50' :
                    isRight ? 'bg-amber-50' : ''
                  return (
                    <tr key={r.id} className={`border-t ${rowHighlight}`}>
                      <td className="px-3 py-2 font-mono">{no != null ? `#${no}` : '—'}</td>
                      <td className="px-3 py-2">{r.summary || '—'}</td>
                      <td className="px-3 py-2">{r.source || '—'}</td>
                      <td className="px-3 py-2">{fmtDate(r.created_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button onClick={() => void pickLeft(r)} className="border rounded px-2 py-1">Sol’a Seç</button>
                          <button onClick={() => void pickRight(r)} className="border rounded px-2 py-1">Sağ’a Seç</button>
                          <button onClick={() => void revertFromRow(r)} className="border rounded px-2 py-1">Geri al</button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* KONTROL ÇUBUĞU */}
      <section className="border rounded p-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600 mr-2">Paneller:</span>

          <div className="flex items-center gap-2">
            <button onClick={() => void navigate('left', -1)} disabled={leftIdx <= 0} className="border rounded px-2 py-1 text-sm disabled:opacity-50">Sol: Önceki</button>
            <button onClick={() => void navigate('left', +1)} disabled={leftIdx < 0 || leftIdx >= sorted.length - 1} className="border rounded px-2 py-1 text-sm disabled:opacity-50">Sol: Sonraki</button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => void navigate('right', -1)} disabled={rightIdx <= 0} className="border rounded px-2 py-1 text-sm disabled:opacity-50">Sağ: Önceki</button>
            <button onClick={() => void navigate('right', +1)} disabled={rightIdx < 0 || rightIdx >= sorted.length - 1} className="border rounded px-2 py-1 text-sm disabled:opacity-50">Sağ: Sonraki</button>
          </div>

          <button onClick={swapSelections} className="border rounded px-2 py-1 text-sm">Seçimleri Değiştir</button>
          <button onClick={clearLeft} disabled={!left} className="border rounded px-2 py-1 text-sm disabled:opacity-50">Sol’u Temizle</button>
          <button onClick={clearRight} disabled={!right} className="border rounded px-2 py-1 text-sm disabled:opacity-50">Sağ’ı Temizle</button>
          <button onClick={() => void revertLeft()} disabled={!left} className="border rounded px-2 py-1 text-sm disabled:opacity-50">Geri Al (Sol)</button>
          <button onClick={() => void revertRight()} disabled={!right} className="border rounded px-2 py-1 text-sm disabled:opacity-50">Geri Al (Sağ)</button>
          <button onClick={() => void copyLeft()} disabled={!left} className="border rounded px-2 py-1 text-sm disabled:opacity-50">Kopyala (Sol)</button>
          <button onClick={() => void copyRight()} disabled={!right} className="border rounded px-2 py-1 text-sm disabled:opacity-50">Kopyala (Sağ)</button>
        </div>
      </section>

      {/* İKİLİ PANEL */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">{leftLabel}</h2>
            {left && <span className="text-xs text-gray-500">{fmtDate(left.created_at)}</span>}
          </div>
          <pre className="whitespace-pre-wrap text-sm">{diffLoading && !left ? 'Yükleniyor…' : left?.content ?? '—'}</pre>
        </div>
        <div className="border rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">{rightLabel}</h2>
            {right && <span className="text-xs text-gray-500">{fmtDate(right.created_at)}</span>}
          </div>
          <pre className="whitespace-pre-wrap text-sm">{diffLoading && !right ? 'Yükleniyor…' : right?.content ?? '—'}</pre>
        </div>
      </section>
    </main>
  )
}
