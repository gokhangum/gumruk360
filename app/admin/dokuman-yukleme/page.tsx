
'use client'
import React, { useEffect, useState } from 'react'

type UploadResp = { ok: boolean, document_id?: string|number, chunks?: number, note?: string, error?: string }
type DocRow = { id: number|string, title: string, source?: string|null, url?: string|null, created_at?: string|null, chunks?: number }

export default function DokumanYuklemePage(){
  const [file, setFile] = useState<File|null>(null)
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('upload')
  const [url, setUrl] = useState('')
  const [chunkSize, setChunkSize] = useState(1200)
  const [overlap, setOverlap] = useState(150)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string>('')
  const [rows, setRows] = useState<DocRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [busyId, setBusyId] = useState<string|number|null>(null)

  async function doUpload(){
    if(!file){ setMsg('Dosya seçin'); return }
    setLoading(true); setMsg('')
    const fd = new FormData()
    fd.set('file', file)
    if(title) fd.set('title', title)
    if(source) fd.set('source', source)
    if(url) fd.set('url', url)
    fd.set('chunk_size', String(chunkSize))
    fd.set('overlap', String(overlap))
    const r = await fetch('/api/admin/gpt-answers/rag/upload', { method:'POST', body: fd })
    let j: UploadResp = { ok:false }
    try { j = await r.json() } catch { j = { ok:false, error:'JSON parse hatası' } }
    setLoading(false)
    if(!j.ok){ setMsg('Hata: ' + (j.error ? j.error : 'status ' + String(r.status))); return }
    const base = 'Yüklendi. doc_id=' + String(j.document_id || '') + ' • chunks=' + String(j.chunks || '')
    const tail = j.note ? ' • not:' + j.note : ''
    setMsg(base + tail)
    setFile(null)
    const inp = document.getElementById('file') as HTMLInputElement | null
    if(inp) inp.value = ''
    await loadDocs()
  }

  async function loadDocs(){
    setListLoading(true)
    const r = await fetch('/api/admin/gpt-answers/rag/docs', { cache:'no-store' })
    let j: any = null
    try { j = await r.json() } catch { j = { ok:false } }
    setListLoading(false)
    if(!j || !j.ok){ return }
    setRows(Array.isArray(j.rows) ? j.rows : [])
  }

  async function delDoc(id: string|number){
    const ok = typeof window !== 'undefined' ? window.confirm('Bu dokümanı ve tüm chunklarını silmek istiyor musunuz?') : true
    if(!ok) return
    setBusyId(id)
    const r = await fetch('/api/admin/gpt-answers/rag/docs/' + String(id), { method:'DELETE' })
    let j: any = null
    try { j = await r.json() } catch { j = { ok:false } }
    setBusyId(null)
    if(!j || !j.ok){ alert('Silme hatası: ' + (j && j.error ? j.error : 'bilinmiyor')); return }
    await loadDocs()
  }

  useEffect(function(){ loadDocs() }, [])

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Doküman Yükleme (RAG)</h1>

      <div className="grid gap-3 p-4 border rounded">
        <label className="text-sm">Başlık
          <input className="mt-1 w-full border rounded px-2 py-1" value={title} onChange={function(e){ setTitle(e.target.value) }} placeholder="Örn: Gümrük Kanunu - Set Eşya" />
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">Kaynak
            <input className="mt-1 w-full border rounded px-2 py-1" value={source} onChange={function(e){ setSource(e.target.value) }} placeholder="law / guide / internal / ..." />
          </label>
          <label className="text-sm">URL (opsiyonel)
            <input className="mt-1 w-full border rounded px-2 py-1" value={url} onChange={function(e){ setUrl(e.target.value) }} placeholder="Resmi link varsa" />
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">Chunk size
            <input type="number" className="mt-1 w-full border rounded px-2 py-1" value={chunkSize} onChange={function(e){ setChunkSize(parseInt(e.target.value || '1200')) }} />
          </label>
          <label className="text-sm">Overlap
            <input type="number" className="mt-1 w-full border rounded px-2 py-1" value={overlap} onChange={function(e){ setOverlap(parseInt(e.target.value || '150')) }} />
          </label>
        </div>
        <label className="text-sm">Dosya (.docx / .txt / .md / .html — PDF için pdf-parse gerekir)
          <input id="file" type="file" className="mt-1 w-full" onChange={function(e){ setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null) }} />
        </label>
        <div className="flex gap-2 items-center">
          <button className="px-3 py-1.5 border rounded" disabled={loading} onClick={doUpload}>{loading ? 'Yükleniyor…' : 'Yükle'}</button>
          {msg ? <div className={ 'text-sm ' + (msg.indexOf('Hata') === 0 ? 'text-red-700' : 'text-green-700') }>{msg}</div> : null}
        </div>
      </div>

      <div className="p-4 border rounded">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Yüklü Dokümanlar</h2>
          <button className="px-3 py-1.5 border rounded" onClick={loadDocs} disabled={listLoading}>{listLoading ? 'Yükleniyor…' : 'Yenile'}</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left">
              <th className="p-2 border-b">ID</th>
              <th className="p-2 border-b">Başlık</th>
              <th className="p-2 border-b">Kaynak</th>
              <th className="p-2 border-b">URL</th>
              <th className="p-2 border-b">Chunk</th>
              <th className="p-2 border-b">Tarih</th>
              <th className="p-2 border-b">Aksiyon</th>
            </tr></thead>
            <tbody>
              {rows && rows.length === 0 ? (<tr><td className="p-2 border-b text-gray-500" colSpan={7}>—</td></tr>) : null}
              {rows ? rows.map(function(r){
                return (
                  <tr key={String(r.id)}>
                    <td className="p-2 border-b">{String(r.id)}</td>
                    <td className="p-2 border-b">{r.title}</td>
                    <td className="p-2 border-b">{r.source ? r.source : '-'}</td>
                    <td className="p-2 border-b">
                      {r.url ? <a href={r.url} className="text-blue-700 underline" target="_blank" rel="noreferrer">link</a> : '-'}
                    </td>
                    <td className="p-2 border-b">{typeof r.chunks === 'number' ? r.chunks : '-'}</td>
                    <td className="p-2 border-b">{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                    <td className="p-2 border-b">
                      <button className="px-2 py-1 border rounded text-xs" disabled={busyId === r.id} onClick={function(){ delDoc(r.id) }}>
                        {busyId === r.id ? 'Siliniyor…' : 'Sil'}
                      </button>
                    </td>
                  </tr>
                )
              }) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
