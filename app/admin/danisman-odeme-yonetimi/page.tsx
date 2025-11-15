
'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Worker = { id: string; name: string }
type ReqItem = { code: string; status: 'pending'|'approved'|'needs_fix'|'rejected'; payment_reference?: string|null; created_at: string; total_settlement?: number|null; currency?: 'TRY'|'USD'|null }

async function fetchJSON(url: string, init?: RequestInit){
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export default function Page(){
  const [workers, setWorkers] = useState<Worker[]>([])
  const [selectedWorker, setSelectedWorker] = useState<string>('')
  const [rate, setRate] = useState<string>('0.6000')
  const [saving, setSaving] = useState(false)

  const [filterWorker, setFilterWorker] = useState<string>('')
  const [requests, setRequests] = useState<ReqItem[]>([])
  const [loadingReq, setLoadingReq] = useState(false)

  useEffect(() => {
    // Load workers (serverless endpoint via RPC or a lightweight page API you already have)
    ;(async () => {
      try{
        const r = await fetchJSON('/api/admin/workers') // You can map this to your existing admin workers list; or replace with direct supabase call on server component if available.
        setWorkers(r.items || [])
      }catch{
        // fallback: empty
        setWorkers([])
      }
    })()
  }, [])

  const selectedWorkerObj = useMemo(() => workers.find(w => w.id === selectedWorker) || null, [workers, selectedWorker])

  async function saveAgreement(){
    if(!selectedWorker) return
    setSaving(true)
    try{
      const body = { worker_id: selectedWorker, rate: Number(rate) }
      await fetchJSON('/api/admin/worker-agreement', { method:'POST', body: JSON.stringify(body) })
      alert('Kaydedildi')
    }catch(e:any){
      alert('Hata: ' + (e?.message || 'kaydedilemedi'))
    }finally{
      setSaving(false)
    }
  }

  async function loadRequests(){
    setLoadingReq(true)
    try{
      const url = '/api/admin/payment-requests' + (filterWorker ? ('?worker_id=' + encodeURIComponent(filterWorker)) : '')
      const r = await fetchJSON(url)
      setRequests(r.items || [])
    }catch(e:any){
      alert('Hata: ' + (e?.message || 'yüklenemedi'))
    }finally{
      setLoadingReq(false)
    }
  }

  useEffect(() => { loadRequests() }, [filterWorker])

  async function updateStatus(code: string, status: ReqItem['status'], payment_reference?: string){
    try{
      await fetchJSON('/api/admin/payment-requests', { method:'PATCH', body: JSON.stringify({ code, status, payment_reference })})
      await loadRequests()
    }catch(e:any){
      alert('Güncellenemedi: ' + (e?.message || ''))
    }
  }

  return (
    <div className="p-6 space-y-10">
      <h1 className="text-2xl font-bold">Danışman Ödeme Yönetimi</h1>

      {/* Bölüm 1: Anlaşma Oranı Yönetimi */}
      <section className="p-4 rounded-2xl shadow border bg-white space-y-4">
        <h2 className="text-lg font-semibold">Anlaşma Oranı</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-sm text-gray-600">Worker</label>
            <select className="w-full border rounded p-2" value={selectedWorker} onChange={(e)=>setSelectedWorker(e.target.value)}>
              <option value="">Seçiniz</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600">Anlaşma oranı (0-1)</label>
            <input className="w-full border rounded p-2" value={rate} onChange={(e)=>setRate(e.target.value)} placeholder="0.60" />
          </div>
          <div>
            <button disabled={!selectedWorker || saving} onClick={saveAgreement} className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50">Kaydet</button>
          </div>
        </div>
      </section>

      {/* Bölüm 2: Ödeme Talepleri */}
      <section className="p-4 rounded-2xl shadow border bg-white space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ödeme Talepleri</h2>
          <div className="flex items-center gap-3">
            <select className="border rounded p-2" value={filterWorker} onChange={(e)=>setFilterWorker(e.target.value)}>
              <option value="">Tümü (Worker)</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button onClick={loadRequests} className="px-3 py-2 rounded-xl border">Yenile</button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full border">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="p-2 border">Ödeme talebi kodu</th>
                <th className="p-2 border">Tutar</th>
                <th className="p-2 border">Durum (seç)</th>
                <th className="p-2 border">Durum</th>
                <th className="p-2 border">Ödeme referansı</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.code}>
                  <td className="p-2 border">
                    <Link target="_blank" className="text-blue-600 underline" href={`/admin/danisman-odeme-yonetimi/${encodeURIComponent(r.code)}`}>{r.code}</Link>
                  </td>
                  <td className="p-2 border">{(r.total_settlement ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {r.currency || ''}</td>
                  <td className="p-2 border">
                    <select className="border rounded p-1" value={r.status} onChange={(e)=>updateStatus(r.code, e.target.value as any)}>
                      <option value="pending">Beklemede</option>
                      <option value="approved">Onaylandı</option>
                      <option value="needs_fix">Düzeltme talep edildi</option>
                      <option value="rejected">Reddedildi</option>
                    </select>
                  </td>
                  <td className="p-2 border">
                    {r.status === 'approved' ? 'Onaylandı' : r.status === 'needs_fix' ? 'Düzeltme talep edildi' : r.status === 'rejected' ? 'Reddedildi' : 'Beklemede'}
                  </td>
                  <td className="p-2 border">{r.payment_reference || '—'}</td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-gray-500">Kayıt yok</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
