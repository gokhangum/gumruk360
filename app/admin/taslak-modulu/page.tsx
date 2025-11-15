'use client'
import React, { useEffect, useState } from 'react'

// -------------------- Types --------------------
type Version = {
  id: string
  profile_id: string
  version_tag: string
  status: 'draft'|'published'|'archived'
  model: string
  temperature: number|null
  max_tokens: number|null
  strict_citations: boolean
  add_legal_disclaimer: boolean
  rag_mode: 'off'|'rag'|'hybrid'
  created_at: string
  style?: 'teknik'|'resmi'
}

type LibraryBlock = {
  id: string
  key: string
  title: string
  body: string
  lang: 'tr'|'en'
  metadata?: any
}

type SelectedBlock = {
  id: string
  sort_order: number
  enabled: boolean
  block: LibraryBlock
}

type EvidenceItem = { label: string; excerpt?: string }
type QualityInfo = {
  missing_citations_count?: number
  used_rag?: boolean
  sources_count?: number
  code_like_repair?: boolean
}

// -------------------- Utils --------------------
 function useLang(): 'tr' | 'en' {
   if (typeof window === 'undefined') return 'tr'
   const h = window.location.hostname.toLowerCase()
    if ((/(^|\.)tr\.easycustoms360\.com$/i).test(h)) return 'en'
   return 'tr'
 }

const SAFE_MODELS = ['gpt-4.1','gpt-4.1-mini','gpt-4o','gpt-4o-mini'] as const
type SafeModel = typeof SAFE_MODELS[number]
function ensureSafeModel(m?: string): SafeModel {
  return (SAFE_MODELS as readonly string[]).includes(String(m)) ? (m as SafeModel) : 'gpt-4.1-mini'
}

async function readBody(res: Response): Promise<{ data: any; raw: string | null; ct: string }>{
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    try { const j = await res.json(); return { data: j, raw: null, ct } } catch {
      const txt = await res.text(); return { data: null, raw: txt, ct }
    }
  }
  const txt = await res.text()
  try { return { data: JSON.parse(txt), raw: null, ct } } catch { return { data: null, raw: txt, ct } }
}

function formatErr(lang: 'tr'|'en', params: {
  status?: number | null
  endpoint?: string
  body?: any
  raw?: string | null
}): string {
  const { status, endpoint, body, raw } = params
  const base = lang === 'en' ? 'Request failed' : 'İstek başarısız'
  const codePart = typeof status === 'number' ? ` [${status}]` : ''
  const epPart = endpoint ? ` ${endpoint}` : ''
  const msg = (body && (body.error || body.message)) || (raw ? raw.slice(0, 500) : '')
  const noMsg = lang === 'en' ? 'No error message' : 'Hata mesajı yok'
  return `${base}${codePart}${epPart} — ${msg || noMsg}`
}

// =============================================================
// Page
// =============================================================
export default function TaslakModulePage(){
  const [tab, setTab] = useState<'config'|'versions'|'test'>('config')
  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-3">Taslak Oluşturma Modülü</h1>
      <div className="flex flex-wrap gap-2 mb-4">
        <button className={`px-3 py-1.5 border rounded ${tab==='config'?'bg-gray-900 text-white':'bg-white'}`} onClick={()=>setTab('config')}>Konfigürasyon</button>
        <button className={`px-3 py-1.5 border rounded ${tab==='versions'?'bg-gray-900 text-white':'bg-white'}`} onClick={()=>setTab('versions')}>Versiyonlar</button>
        <button className={`px-3 py-1.5 border rounded ${tab==='test'?'bg-gray-900 text-white':'bg-white'}`} onClick={()=>setTab('test')}>Test Alanı</button>
      </div>
      {tab==='config' && <ConfigTab/>}
      {tab==='versions' && <VersionsTab/>}
      {tab==='test' && <TestTab/>}
    </div>
  )
}

// =============================================================
// Config Tab + Context Builder + Block Editor
// =============================================================
function ConfigTab(){
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [version, setVersion] = useState<Version|null>(null)
  const [blocks, setBlocks] = useState<SelectedBlock[]>([])
  const [library, setLibrary] = useState<LibraryBlock[]>([])

  const [model, setModel] = useState<SafeModel>('gpt-4.1-mini')
  const [temperature, setTemperature] = useState<number>(0.2)
  const [maxTokens, setMaxTokens] = useState<number>(1024)
  const [strict, setStrict] = useState<boolean>(true)
  const [legal, setLegal] = useState<boolean>(true)
  const [style, setStyle] = useState<'teknik'|'resmi'>('teknik')
  const [ragMode, setRagMode] = useState<'off'|'rag'|'hybrid'>('off')

  // — Block editor modal state
  const [editOpen, setEditOpen] = useState(false)
  const [editBlockId, setEditBlockId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editLang, setEditLang] = useState<'tr'|'en'>('tr')
  const [editBody, setEditBody] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  const lang = useLang()
  // --- Yeni Kütüphane Bloğu (Create Modal) state'leri ---
  const [createOpen, setCreateOpen] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newLang, setNewLang] = useState<'tr'|'en'>(lang)
  const [newBody, setNewBody] = useState('')
  const [savingNew, setSavingNew] = useState(false)

  async function createLibraryBlock(){
    if (!newKey.trim() || !newTitle.trim() || !newBody.trim()) {
      alert(lang==='en' ? 'key, title, body are required' : 'key, title, body zorunlu'); 
      return
    }
    setSavingNew(true)
    const endpoint = '/api/admin/gpt-answers/blocks/library'
    const res = await fetch(endpoint, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        key: newKey.trim(),
        title: newTitle.trim(),
        body: newBody,
        lang: newLang
      })
    })
    const { data, raw } = await readBody(res)
    if (!res.ok || !data?.ok) {
      alert(formatErr(lang, { status: res.status, endpoint, body: data, raw }))
      setSavingNew(false)
      return
    }
    try { await refreshLibraryWithBody() } catch {}
    setCreateOpen(false)
    setNewKey(''); setNewTitle(''); setNewBody(''); setNewLang(lang)
    setSavingNew(false)
  }


  async function loadConfig(){
    setLoading(true); setError(null)
    const endpoint = '/api/admin/gpt-answers/config'
    try{
      const res = await fetch(endpoint, { cache:'no-store' })
      const { data, raw } = await readBody(res)
      if(!res.ok){ throw new Error(formatErr(lang, { status: res.status, endpoint, body: data, raw })) }
      if(data?.ok){
        setProfile(data.profile)
        setVersion(data.version)
        setBlocks((data.blocks||[]).map((b:any)=>({ id:b.id, sort_order:b.sort_order, enabled:b.enabled, block:b.gpt_prompt_blocks })))
        setLibrary((data.library||[]))
        if(data.version){
          setModel(ensureSafeModel(data.version.model))
          setTemperature(data.version.temperature ?? 0.2)
          setMaxTokens(data.version.max_tokens ?? 1024)
          setStrict(!!data.version.strict_citations)
          setLegal(!!data.version.add_legal_disclaimer)
          setRagMode(data.version.rag_mode || 'off')
          setStyle((data.version as any)?.style || 'teknik')
        }
      } else { throw new Error(formatErr(lang, { body: data, endpoint })) }
    }catch(e:any){
      setError(String(e?.message || e))
    }finally{
      setLoading(false)
      try { await refreshLibraryWithBody() } catch {}
    }
  }
  useEffect(()=>{ loadConfig() }, [])

  async function refreshLibraryWithBody(){
    const r = await fetch('/api/admin/gpt-answers/blocks/library', { cache: 'no-store' })
    const { data } = await readBody(r)
    if (r.ok && data?.ok && Array.isArray(data.rows)) {
      setLibrary(data.rows)
    }
  }

  async function save(){
    if(!profile || !version) return alert('Aktif profil/sürüm bulunamadı. Önce Versiyonlar sekmesinden bir sürüm oluşturun.')
    const endpoint = '/api/admin/gpt-answers/config'
    const res = await fetch(endpoint, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ profile_id: profile.id, version_id: version.id,
        updates:{ model, temperature, max_tokens: maxTokens, top_p: 1, strict_citations: strict, add_legal_disclaimer: legal, rag_mode: ragMode, style } })
    })
    const { data, raw } = await readBody(res)
    if(!res.ok || !data?.ok){ alert(formatErr(lang, { status: res.status, endpoint, body: data, raw })); return }
    alert('Kaydedildi')
  }

  async function saveBlocks(){
    if(!version) return alert('Önce aktif sürüm seçin.')
    const endpoint = '/api/admin/gpt-answers/blocks'
    const items = blocks.map((b, idx) => ({ block_id: b.block.id, sort_order: idx + 1, enabled: b.enabled, params: {} }))
    const res = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ profile_version_id: version.id, items }) })
    const { data, raw } = await readBody(res)
    if(!res.ok || !data?.ok) { alert(formatErr(lang, { status: res.status, endpoint, body: data, raw })); return }
    alert('Bloklar kaydedildi')
  }

  async function openEditor(blockId: string){
    // Kütüphane state'inde yoksa body'yi GET ile kesinlikle çek
    let b = library.find(x=>x.id===blockId)
    if (!b || !b.body) {
      const r = await fetch(`/api/admin/gpt-answers/blocks/library?id=${blockId}`, { cache: 'no-store' })
      const { data } = await readBody(r)
      if (r.ok && data?.rows?.length) {
        const full = data.rows[0]
        setLibrary(prev => {
          const exists = prev.find(x=>x.id===blockId)
          return exists ? prev.map(x=>x.id===blockId? full : x) : [...prev, full]
        })
        b = full
      }
    }
    setEditBlockId(blockId)
    setEditTitle(b?.title || '')
    setEditLang((b?.lang as any)||'tr')
    setEditBody(b?.body || '')
    setEditOpen(true)
  }

  async function saveEditor(){
    if(!editBlockId) return
    setEditBusy(true)
    const endpoint = `/api/admin/gpt-answers/blocks/library/${editBlockId}`
    const res = await fetch(endpoint, { method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title: editTitle, lang: editLang, body: editBody }) })
    const { data, raw } = await readBody(res)
    setEditBusy(false)
    if(!res.ok || !data?.ok){ alert(formatErr(lang, { status: res.status, endpoint, body: data, raw })); return }
    setLibrary(prev => prev.map(x => x.id===editBlockId ? { ...x, title: editTitle, lang: editLang, body: editBody } : x))
    setEditOpen(false)
    alert('Blok kaydedildi (global)')
  }

  if(loading){ return <div className="border rounded p-4">Yükleniyor…</div> }
  if(error){ return <div className="border rounded p-4 text-red-700">Hata: {error}</div> }
  if(!profile || !version){ return <div className="border rounded p-4">Aktif profil ve yayınlanmış sürüm bulunamadı.</div> }

  return (
    <>
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        {/* Genel Ayarlar */}
        <div className="p-4 border rounded-md">
          <h3 className="font-semibold mb-3">{lang==='tr'?'Genel Ayarlar':'General Settings'}</h3>
          <div className="grid gap-3">
            <label className="flex items-center justify-between gap-2">
              <span>Model</span>
              <select value={model} onChange={e=>setModel(ensureSafeModel(e.target.value))} className="border px-2 py-1 rounded w-52">
                <option value="gpt-4.1">gpt-4.1</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                <option value="gpt-4o">gpt-4o</option>
                <option value="gpt-4o-mini">gpt-4o-mini</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2"><span>Stil</span>
              <select value={style} onChange={e=>setStyle(e.target.value as 'teknik'|'resmi')} className="border px-2 py-1 rounded w-52">
                <option value="teknik">Teknik Detaylı</option><option value="resmi">Resmî Yazı Dili</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2"><span>Sıcaklık</span>
              <input type="number" step={0.1} value={temperature} onChange={e=>setTemperature(parseFloat(e.target.value))} className="border px-2 py-1 rounded w-28" />
            </label>
            <label className="flex items-center justify-between gap-2"><span>Maks. Token</span>
              <input type="number" value={maxTokens} onChange={e=>setMaxTokens(parseInt(e.target.value||'0'))} className="border px-2 py-1 rounded w-32" />
            </label>
            <label className="flex items-center justify-between gap-2"><span>Strict citations</span>
              <input type="checkbox" checked={strict} onChange={e=>setStrict(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-2"><span>Hukukî uyarı</span>
              <input type="checkbox" checked={legal} onChange={e=>setLegal(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-2"><span>RAG</span>
              <select value={ragMode} onChange={e=>setRagMode(e.target.value as any)} className="border px-2 py-1 rounded w-40">
                <option value="off">Kapalı</option><option value="rag">RAG</option><option value="hybrid">Hibrit</option>
              </select>
            </label>
            <div className="flex gap-2">
              <button onClick={()=>save()} className="px-3 py-1.5 border rounded">Kaydet</button>
              <button onClick={()=>saveBlocks()} className="px-3 py-1.5 border rounded">Blokları Kaydet</button>
            </div>
          </div>
        </div>

        {/* Context Builder */}
        <div className="p-4 border rounded-md">
          <h3 className="font-semibold mb-3">Context Builder</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {/* Kütüphane */}
            <div className="border rounded p-2">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Kütüphane</div>
                <button
                  className="text-xs px-2 py-0.5 border rounded"
                  onClick={() => setCreateOpen(true)}
                >
                  {lang==='en' ? 'New Block' : 'Yeni Blok'}
                </button>
              </div>
              <ul className="space-y-1">
                {library.map((b)=> (
                  <li key={b.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{b.title}</span>
                    <div className="flex gap-2">
                      <button className="text-xs px-2 py-0.5 border rounded"
                        onClick={()=> setBlocks(prev=>[...prev, { id: ((globalThis as any).crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`), sort_order:prev.length+1, enabled:true, block:b }])}>
                        Ekle
                      </button>
                      <button className="text-xs px-2 py-0.5 border rounded"
                        onClick={()=> openEditor(b.id)}>
                        Düzenle
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Seçili bloklar */}
            <div className="border rounded p-2">
              <div className="font-semibold mb-2">Seçili Bloklar</div>
              {blocks.length===0 ? (
                <div className="text-sm text-gray-500">—</div>
              ) : (
                <ul className="space-y-2">
                  {blocks.map((b, idx)=> (
                    <li key={b.id} className="border rounded p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">{idx+1}. {b.block.title}</span>
                        <div className="flex gap-2">
                          <button className="text-xs px-2 py-0.5 border rounded"
                            onClick={()=>{ setBlocks(prev=>{ const arr=[...prev]; const i=arr.findIndex(x=>x.id===b.id); if(i>0){ const t=arr[i-1]; arr[i-1]=arr[i]; arr[i]=t } return arr }) }}>
                            Yukarı
                          </button>
                          <button className="text-xs px-2 py-0.5 border rounded"
                            onClick={()=>{ setBlocks(prev=>{ const arr=[...prev]; const i=arr.findIndex(x=>x.id===b.id); if(i>=0 && i<arr.length-1){ const t=arr[i+1]; arr[i+1]=arr[i]; arr[i]=t } return arr }) }}>
                            Aşağı
                          </button>
                          <button className="text-xs px-2 py-0.5 border rounded" onClick={()=> setBlocks(prev=> prev.filter(x=>x.id!==b.id))}>Sil</button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <label className="text-xs flex items-center gap-2">
                          <input type="checkbox" checked={b.enabled} onChange={e=>{
                            setBlocks(prev=>{ const arr=[...prev]; const i=arr.findIndex(x=>x.id===b.id); if(i>=0) arr[i]={...arr[i], enabled:e.target.checked}; return arr })
                          }}/>
                          Etkin
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Açıklamalar */}
      <div className="p-4 border rounded-md">
        <h3 className="font-semibold mb-3">Açıklamalar</h3>
        <p className="text-sm text-gray-700">Model ve Stil seçimleri burada kaydedilir; editör/worker ekranındaki “ChatGPT ile taslak üret” bu ayarlarla çalışır.</p>
      </div>

      {/* Modal Editör (global blok düzenleme) */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white w-[min(920px,calc(100%-2rem))] max-h-[90vh] overflow-auto rounded shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Blok Düzenle (Global)</h3>
              <button className="px-2 py-1 border rounded" onClick={()=> setEditOpen(false)}>Kapat</button>
            </div>
            <div className="grid gap-3">
              <label className="text-sm">
                Başlık
                <input className="w-full border rounded px-2 py-1 mt-1" value={editTitle} onChange={e=>setEditTitle(e.target.value)} />
              </label>
              <label className="text-sm">
                Dil
                <select className="border rounded px-2 py-1 mt-1" value={editLang} onChange={e=>setEditLang(e.target.value as 'tr'|'en')}>
                  <option value="tr">TR</option>
                  <option value="en">EN</option>
                </select>
              </label>
              <label className="text-sm">
                Metin (body)
                <textarea className="w-full border rounded p-2 mt-1 min-h-[260px]" value={editBody} onChange={e=>setEditBody(e.target.value)} />
              </label>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 border rounded" disabled={editBusy} onClick={()=>saveEditor()}>
                  {editBusy?'Kaydediliyor…':'Kaydet'}
                </button>
                <span className="text-xs text-gray-500">Kaydet: tüm versiyonlarda bu blok güncellenir.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Yeni Blok (Create) Modal */}
      {createOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow p-4 w-[min(96vw,720px)]">
            <div className="text-lg font-semibold mb-3">
              {lang==='en' ? 'New Library Block' : 'Yeni Blok'}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col">
                <label className="text-xs text-gray-600">Key</label>
                <input
                  className="border rounded px-2 py-1"
                  placeholder="evidence_usage_tr"
                  value={newKey}
                  onChange={e=>setNewKey(e.target.value)}
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs text-gray-600">{lang==='en'?'Language':'Dil'}</label>
                <select
                  className="border rounded px-2 py-1"
                  value={newLang}
                  onChange={e=>setNewLang(e.target.value as 'tr'|'en')}
                >
                  <option value="tr">tr</option>
                  <option value="en">en</option>
                </select>
              </div>

              <div className="md:col-span-2 flex flex-col">
                <label className="text-xs text-gray-600">{lang==='en'?'Title':'Başlık'}</label>
                <input
                  className="border rounded px-2 py-1"
                  placeholder={lang==='en'?'Evidence Usage':'Evidence Kullanımı'}
                  value={newTitle}
                  onChange={e=>setNewTitle(e.target.value)}
                />
              </div>

              <div className="md:col-span-2 flex flex-col">
                <label className="text-xs text-gray-600">Body</label>
                <textarea
                  className="border rounded px-2 py-1 min-h-[220px]"
                  placeholder={lang==='en'?'Prompt body...':'Prompt gövdesi...'}
                  value={newBody}
                  onChange={e=>setNewBody(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                className="px-3 py-1.5 border rounded"
                onClick={()=> setCreateOpen(false)}
                disabled={savingNew}
              >
                {lang==='en'?'Cancel':'Vazgeç'}
              </button>
              <button
                className="px-3 py-1.5 border rounded bg-black text-white disabled:opacity-50"
                onClick={createLibraryBlock}
                disabled={savingNew}
              >
                {savingNew ? (lang==='en'?'Saving...':'Kaydediliyor...') : (lang==='en'?'Create':'Oluştur')}
              </button>
            </div>
          </div>
        </div>
  
    )}
    </>

  )
}

// =============================================================
// Versions Tab (Sil: draft + archived serbest)
// =============================================================
function VersionsTab(){
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)
  const [rows, setRows] = useState<Version[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')
  const [baseId, setBaseId] = useState<string>('')
  const lang = useLang()

  function extractRows(body: any): Version[] {
    if (!body) return []
    if (Array.isArray(body)) return body as Version[]
    if (Array.isArray(body.rows)) return body.rows as Version[]
    if (Array.isArray(body.data)) return body.data as Version[]
    if (body.ok === true && Array.isArray(body.list)) return body.list as Version[]
    return []
  }

  async function load(){
    setLoading(true); setError(null)
    const endpoint = '/api/admin/gpt-answers/versions'
    try{
      const res = await fetch(endpoint, { cache:'no-store' })
      const { data, raw } = await readBody(res)
      if (!res.ok) { throw new Error(formatErr(lang, { status: res.status, endpoint, body: data, raw })) }
      const nextRows = extractRows(data)
      setRows(nextRows)
      if (!nextRows.length && data?.ok === false) { throw new Error(formatErr(lang, { endpoint, body: data })) }
    }catch(e:any){ setError(String(e?.message || formatErr(lang, {}))) }
    finally{ setLoading(false) }
  }
  useEffect(()=>{ load() }, [])

  async function createVersion(){
    const endpoint = '/api/admin/gpt-answers/versions'
    if(!newTag.trim()) { alert(lang==='en'?'Enter a version name.':'Bir versiyon adı girin.'); return }
    try{
      const res = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ version_tag: newTag.trim(), base_version_id: baseId || undefined }) })
      const { data, raw } = await readBody(res)
      if(!res.ok || !data?.ok){ alert(formatErr(lang, { status: res.status, endpoint, body: data, raw })); return }
      setNewTag(''); setBaseId(''); await load()
    }catch(e:any){ alert(String(e?.message || formatErr(lang, { endpoint }))) }
  }

  async function doAction(id: string, action: 'activate'|'archive'|'delete'){
    const endpoint = `/api/admin/gpt-answers/versions/${id}`
    try{
      setBusyId(id)
      let res: Response
      if(action === 'delete'){ res = await fetch(endpoint, { method:'DELETE' }) }
      else { res = await fetch(endpoint, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action }) }) }
      const { data, raw } = await readBody(res)
      if(!res.ok || !data?.ok){ alert(formatErr(lang, { status: res.status, endpoint, body: data, raw })); return }
      await load()
    } catch(e:any){ alert(String(e?.message || formatErr(lang, { endpoint }))) }
    finally { setBusyId(null) }
  }

  if(loading) return <div className="border rounded p-4">Yükleniyor…</div>
  if(error) return <div className="border rounded p-4 text-red-700">{lang==='en' ? 'Error' : 'Hata'}: {error}</div>

  return (
    <div className="border rounded p-4 overflow-x-auto">
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">{lang==='en'?'Version name':'Versiyon adı'}</label>
          <input className="border rounded px-2 py-1" value={newTag} onChange={e=>setNewTag(e.target.value)} placeholder={lang==='en'?'e.g. v1.2':'ör. v1.2'} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">{lang==='en'?'Copy from':'Şundan kopyala'}</label>
          <select className="border rounded px-2 py-1 min-w-[220px]" value={baseId} onChange={e=>setBaseId(e.target.value)}>
            <option value="">{lang==='en'?'(empty)':'(boş)'}</option>
            {rows.map(r=> <option key={r.id} value={r.id}>{r.version_tag} — {r.status}</option>)}
          </select>
        </div>
        <button className="px-3 py-1.5 border rounded" onClick={()=>createVersion()}>{lang==='en'?'Create version':'Versiyon oluştur'}</button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="p-2 border-b">Versiyon</th><th className="p-2 border-b">Durum</th><th className="p-2 border-b">Model</th><th className="p-2 border-b">Stil</th>
            <th className="p-2 border-b">Strict</th><th className="p-2 border-b">Hukukî Uyarı</th><th className="p-2 border-b">RAG</th><th className="p-2 border-b">Tarih</th><th className="p-2 border-b">Aksiyonlar</th>
          </tr>
        </thead>
        <tbody>
          {rows.length===0 && (<tr><td className="p-2 border-b text-gray-500" colSpan={9}>—</td></tr>)}
          {rows.map((r)=> {
            const canDelete = (r.status === 'draft' || r.status === 'archived')
            return (
            <tr key={r.id}>
              <td className="p-2 border-b">{r.version_tag}</td>
              <td className="p-2 border-b">{r.status}</td>
              <td className="p-2 border-b">{r.model}</td>
              <td className="p-2 border-b">{r.style || 'teknik'}</td>
              <td className="p-2 border-b">{r.strict_citations ? 'Açık' : 'Kapalı'}</td>
              <td className="p-2 border-b">{r.add_legal_disclaimer ? 'Açık' : 'Kapalı'}</td>
              <td className="p-2 border-b">{r.rag_mode}</td>
              <td className="p-2 border-b">{new Date(r.created_at).toLocaleString()}</td>
              <td className="p-2 border-b">
                <div className="flex flex-wrap gap-1">
                  {r.status!=='published' && (
                    <button className="px-2 py-1 border rounded text-xs" disabled={busyId===r.id} onClick={()=>doAction(r.id, 'activate')}>{lang==='en'?'Activate':'Aktifleştir'}</button>
                  )}
                  {r.status!=='archived' && (
                    <button className="px-2 py-1 border rounded text-xs" disabled={busyId===r.id} onClick={()=>doAction(r.id, 'archive')}>{lang==='en'?'Archive':'Arşivle'}</button>
                  )}
                  <button className="px-2 py-1 border rounded text-xs disabled:opacity-50"
                    disabled={busyId===r.id || !canDelete}
                    title={!canDelete ? (lang==='en'?'Only draft/archived can be deleted':'Yalnızca taslak/arşivli silinebilir') : ''}
                    onClick={()=>{ if (confirm(lang==='en' ? 'Delete this version? This cannot be undone.' : 'Bu versiyonu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) { doAction(r.id, 'delete') } }}>
                    {lang==='en'?'Delete':'Sil'}
                  </button>
                </div>
              </td>
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  )
}

// =============================================================
// Test Tab (değişmedi)
// =============================================================
function TestTab(){
  const [q, setQ] = useState('Eşyanın GTİP tespiti ve KDV istisnası hakkında bilgi verebilir misiniz?')
  const [lang, setLang] = useState<'tr'|'en'>(useLang())
  const [style, setStyle] = useState<'teknik'|'resmi'>('teknik')
  const [strict, setStrict] = useState(true)
  const [legal, setLegal] = useState(true)
  const [rag, setRag] = useState(false)
  const [resText, setResText] = useState('')
  const [tokens, setTokens] = useState<{prompt:number, completion:number}|null>(null)
  const [cost, setCost] = useState<number|null>(null)
  const [loading, setLoading] = useState(false)
  const [sumLoading, setSumLoading] = useState(false)
  const [sources, setSources] = useState<EvidenceItem[]>([])
  const [quality, setQuality] = useState<QualityInfo | null>(null)
  // Geçici ekler (DB'ye kaydetmez): metin ve dosya
  const [tempTexts, setTempTexts] = useState<string[]>([''])
  const [tempFiles, setTempFiles] = useState<File[]>([])

  // Maliyet hesabı için model bilgisi
  const [modelUsed, setModelUsed] = useState<SafeModel>('gpt-4.1-mini')

  useEffect(()=>{
    (async()=>{
      try{
        const res = await fetch('/api/admin/gpt-answers/config', { cache:'no-store' })
        const { data } = await readBody(res)
        const m = data?.data?.model || data?.model || data?.data?.profile?.model
        if (typeof m === 'string') setModelUsed(m as SafeModel)
      }catch{}
    })()
  }, [])

  async function toBase64Files(files: File[]): Promise<Array<{name:string;type:string;size:number;b64:string}>>{
    const out: Array<{name:string;type:string;size:number;b64:string}> = []
    for (const f of files){
      const buf = new Uint8Array(await f.arrayBuffer())
      let binary = ''
      for (let i=0;i<buf.length;i++){ binary += String.fromCharCode(buf[i]) }
      const b64 = btoa(binary)
      out.push({ name:f.name, type:f.type, size:f.size, b64 })
    }
    return out
  }

  function estimateCostUSD(tokens?: {prompt:number, completion:number} | null, model: string = modelUsed): number | null {
    if (!tokens) return null
    const PRICING: Record<string, {in:number; out:number}> = {
      'gpt-4.1-mini': { in: 0.15, out: 0.60 },
      'gpt-4o-mini': { in: 0.15, out: 0.60 },
      'gpt-4o': { in: 5.00, out: 15.00 },
      'gpt-4.1': { in: 5.00, out: 15.00 },
    }
    const p = PRICING[model] || PRICING['gpt-4.1-mini']
    const v = (tokens.prompt/1_000_000) * p.in + (tokens.completion/1_000_000) * p.out
    return Math.round(v * 10000) / 10000
  }


  async function run(){
    setLoading(true)
    setResText(''); setTokens(null); setCost(null); setSources([]); setQuality(null)
    try{
      // Geçici ekleri hazırla
      const tmp_texts = tempTexts.filter(t=>t && t.trim().length>0)
      const tmp_files = await toBase64Files(tempFiles)

      const r = await fetch('/api/admin/gpt-answers/run', { 
        method:'POST', 
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ question_text:q, lang, style, strict_citations:strict, legal_disclaimer:legal, rag, temp_texts: tmp_texts, temp_files_base64: tmp_files }) 
      })

      const { data, raw, ct } = await readBody(r)
      if(!r.ok || !data?.ok){ 
        setResText(String(data?.error || raw || `HTTP ${r.status}`)); 
        return 
      }
      setResText(data.data?.text || '')
      setTokens(data.data?.tokens || null)
      setCost(data.data?.cost_usd ?? null)
      if ((data.data?.cost_usd == null) && data.data?.tokens){ 
        const est = estimateCostUSD(data.data.tokens, data.data?.model_used || modelUsed); 
        if (typeof est==='number') setCost(est) 
      }
      setSources(data.data?.sources || [])
      setQuality(data.data?.quality || null)
    }catch(e:any){
      setResText('İstek/parsing hatası: ' + String(e?.message||e))
    }finally{
      setLoading(false)
    }
  }

  async function summarize(){
    setSumLoading(true)
    try{
      const r = await fetch('/api/admin/gpt-answers/summarize', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ text_md: resText, lang, target_ratio: 0.65, keep_citations: true }) })
      const { data } = await readBody(r)
      if(!r.ok || !data?.ok) return
      setResText(data.data?.text || '')
      setTokens(data.data?.tokens || null)
      setCost(data.data?.cost_usd ?? null)
    }catch{
      /* sessiz geç */ 
    }finally{
      setSumLoading(false)
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="p-4 border rounded-md">
        <div className="grid gap-2 mb-2">
          <label className="flex items-center gap-2"><span className="w-28">Dil</span>
            <select value={lang} onChange={(e)=>setLang(e.target.value as any)} className="border rounded px-2 py-1"><option value="tr">TR</option><option value="en">EN</option></select>
          </label>
          <label className="flex items-center gap-2"><span className="w-28">Stil</span>
            <select value={style} onChange={(e)=>setStyle(e.target.value as any)} className="border rounded px-2 py-1"><option value="teknik">Teknik</option><option value="resmi">Resmî</option></select>
          </label>
          <label className="flex items-center gap-2"><span className="w-28">Strict</span>
            <input type="checkbox" checked={strict} onChange={e=>setStrict(e.target.checked)} />
          </label>
          <label className="flex items-center gap-2"><span className="w-28">Hukukî uyarı</span>
            <input type="checkbox" checked={legal} onChange={e=>setLegal(e.target.checked)} />
          </label>
          <label className="flex items-center gap-2"><span className="w-28">RAG</span>
            <input type="checkbox" checked={rag} onChange={e=>setRag(e.target.checked)} />
          </label>
        
        {/* Geçici Ekler (DB'ye kaydetmez) */}
        <div className="mt-3 border rounded p-2">
          <div className="font-semibold mb-2 text-sm">Geçici Ekler</div>
          <div className="space-y-2">
            {tempTexts.map((t, i)=>(
              <div key={i} className="flex items-start gap-2">
                <textarea className="flex-1 border rounded p-2 text-sm" placeholder="Ek metin (geçici)..." value={t}
                  onChange={e=>setTempTexts(prev=> prev.map((x,idx)=> idx===i? e.target.value : x))} />
                <button className="px-2 py-1 border rounded" onClick={()=> setTempTexts(prev=> prev.filter((_,idx)=> idx!==i))}>Sil</button>
              </div>
            ))}
            <button className="px-2 py-1 border rounded" onClick={()=> setTempTexts(prev=> [...prev, ''])}>Metin ekle</button>
          </div>

          <div className="mt-3">
            <input type="file" multiple onChange={(e)=> setTempFiles([...(e.target.files ? Array.from(e.target.files) : [])])} />
            {tempFiles.length>0 && (
              <ul className="mt-2 text-xs list-disc pl-5">
                {tempFiles.map((f, i)=> <li key={i} className="flex items-center justify-between gap-2">
                  <span>{f.name} ({Math.round(f.size/1024)} KB)</span>
                  <button className="px-2 py-0.5 border rounded" onClick={()=> setTempFiles(prev=> prev.filter((_,idx)=> idx!==i))}>Kaldır</button>
                </li>)}
              </ul>
            )}
          </div>
        </div>
</div>

        <textarea className="w-full border rounded p-2 min-h-[160px]" value={q} onChange={e=>setQ(e.target.value)} />

        <div className="flex gap-2 mt-2">
          <button onClick={()=>run()} className="px-3 py-1.5 border rounded">{loading?'Üretiliyor…':'Üret'}</button>
          <button onClick={()=>summarize()} className="px-3 py-1.5 border rounded" disabled={sumLoading}>{sumLoading?'Özetleniyor…':'Özetle'}</button>
        </div>
      </div>

      <div className="p-4 border rounded-md">
        <h3 className="font-semibold mb-2">Sonuç</h3>
        <div className="text-xs text-gray-500 mb-2">
          Token: {tokens ? `${tokens.prompt} in / ${tokens.completion} out` : '-'} • $: {typeof cost==='number' ? cost.toFixed(4) : (tokens ? `≈${(estimateCostUSD(tokens) ?? 0).toFixed(4)}` : '-')}
        </div>
        <pre className="whitespace-pre-wrap text-sm">{resText}</pre>

        <h4 className="font-semibold mt-4">Kaynaklar</h4>
        {Array.isArray(sources) && sources.length>0 ? (
          <ul className="list-disc pl-5">{sources.map((s, i)=> <li key={i}><b>{s.label}</b>{s.excerpt?`: ${s.excerpt}`:''}</li>)}</ul>
        ) : <div className="text-sm text-gray-500">—</div>}

        {quality ? (
          <div className="mt-3 text-xs text-gray-600">
            Eksik atıf sayısı: {quality.missing_citations_count ?? 0} • RAG: {quality.used_rag?'evet':'hayır'} • Kaynak adedi: {quality.sources_count ?? 0}
          </div>
        ) : null}
      </div>
    </div>
  )
}
