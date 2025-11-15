
'use client'
import { useEffect, useMemo, useState } from 'react'

type Line = { id: string; question_id: string; question_date: string; amount_tl: number|null; amount_usd: number|null; price_usd_rate_used: number|null; fx_usd_try_on_date: number|null; final_amount: number|null; agreement_rate: number|null; hakedis: number|null }
type Header = { code: string; worker_name: string; status: 'pending'|'approved'|'needs_fix'|'rejected'; payment_reference?: string|null }
type Payload = { ok: boolean; header: any; lines: Line[]; totals: { total_hakedis: number } }

async function fetchJSON(url: string, init?: RequestInit){
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export default function Page({ params }: { params: { code: string }}){
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'pending'|'approved'|'needs_fix'|'rejected'>('pending')
  const [payref, setPayref] = useState('')

  const code = params.code

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try{
        const r = await fetchJSON(`/api/admin/payment-requests/${encodeURIComponent(code)}`)
        setData(r)
        setStatus(r.header.status)
        setPayref(r.header.payment_reference || '')
      }catch(e:any){
        alert('Yüklenemedi: ' + (e?.message || ''))
      }finally{
        setLoading(false)
      }
    })()
  }, [code])

  async function apply(){
    try{
      await fetchJSON('/api/admin/payment-requests', { method:'PATCH', body: JSON.stringify({ code, status, payment_reference: payref || null }) })
      alert('Güncellendi')
    }catch(e:any){
      alert('Güncellenemedi: ' + (e?.message || ''))
    }
  }

  const totalHakedis = data?.totals?.total_hakedis || 0

  if (loading) return <div className="p-6">Yükleniyor…</div>
  if (!data?.ok) return <div className="p-6">Bulunamadı</div>

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">{data.header.worker_name} – {data.header.code}</h1>

      <div className="overflow-auto rounded-2xl border">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-2 border">Soru ID</th>
              <th className="p-2 border">Soru tarihi</th>
              <th className="p-2 border">Para birimi</th>
              <th className="p-2 border">Ödeme tutarı</th>
              <th className="p-2 border">Kur</th>
              <th className="p-2 border">FX</th>
              <th className="p-2 border">Nihai tutar</th>
              <th className="p-2 border">Anlaşma oranı</th>
              <th className="p-2 border">Hakediş</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((ln) => {
              const currency = (ln.amount_usd != null) ? 'USD' : 'TRY'
              const tutar = (ln.amount_usd != null) ? ln.amount_usd : (ln.amount_tl || 0)
              const kur = currency === 'TRY' ? 1 : (ln.price_usd_rate_used || 0)
              const fx  = ln.fx_usd_try_on_date || 0
              return (
                <tr key={ln.id}>
                  <td className="p-2 border">{ln.question_id}</td>
                  <td className="p-2 border">{ln.question_date}</td>
                  <td className="p-2 border">{currency}</td>
                  <td className="p-2 border">{tutar?.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                  <td className="p-2 border">{kur?.toLocaleString(undefined,{minimumFractionDigits:4, maximumFractionDigits:4})}</td>
                  <td className="p-2 border">{fx?.toLocaleString(undefined,{minimumFractionDigits:4, maximumFractionDigits:4})}</td>
                  <td className="p-2 border">{(ln.final_amount||0)?.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                  <td className="p-2 border">{(ln.agreement_rate||0).toLocaleString(undefined,{style:'percent', minimumFractionDigits:2})}</td>
                  <td className="p-2 border font-semibold">{(ln.hakedis||0)?.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                </tr>
              )
            })}
            {data.lines.length === 0 && (
              <tr><td colSpan={9} className="p-4 text-center text-gray-500">Satır yok</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="p-2 border" colSpan={8} style={{ textAlign:'right' }}><strong>Toplam Hakediş</strong></td>
              <td className="p-2 border font-bold">{totalHakedis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Durum</label>
          <select className="border rounded p-2" value={status} onChange={(e)=>setStatus(e.target.value as any)}>
            <option value="pending">Beklemede</option>
            <option value="approved">Onaylandı</option>
            <option value="needs_fix">Düzeltme talep edildi</option>
            <option value="rejected">Reddedildi</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm text-gray-600 mb-1">Ödeme referansı</label>
          <input className="w-full border rounded p-2" value={payref} onChange={(e)=>setPayref(e.target.value)} placeholder="Banka işlem no / açıklama" />
        </div>
        <button onClick={apply} className="px-4 py-2 rounded-xl bg-black text-white">Uygula</button>
      </div>
    </div>
  )
}
