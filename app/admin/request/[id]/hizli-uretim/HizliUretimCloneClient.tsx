'use client'

// app/admin/request/[id]/hizli-uretim/HizliUretimCloneClient.tsx

import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type EvidenceItem = { label: string, excerpt?: string|null }
type QualityInfo = {
  missing_citations_count?: number|null
  sources_count?: number|null
  used_rag?: boolean
  rag_error?: string|null
}
type TempFile = { name: string, b64: string, type?: string|null, size?: number|null }
type ProfileConfig = {
  profile_id?: string|null
  version_tag?: string|null
  model?: string|null
  temperature?: number|null
  max_tokens?: number|null
  top_p?: number|null
  strict_citations: boolean
  add_legal_disclaimer: boolean
  rag_mode?: string|null
  rag_params?: any
  output_schema?: any
  style?: 'teknik'|'resmi'|string|null
  created_at?: string|null
  created_by?: string|null
}

function prettySize(bytes?: number|null){
  if (!bytes || bytes <= 0) return '-'
  const units = ['B','KB','MB','GB']
  let i = 0, n = bytes as number
  while (n >= 1024 && i < units.length-1){
    n /= 1024; i++
  }
  return `${n.toFixed(i===0?0:1)} ${units[i]}`
}

export default function HizliUretimCloneClient(props: {
  questionId: string
  initialQuestion: string
  initialTempFiles: TempFile[]
  prefillDebug: any
  isAdmin: boolean
  profileConfig: ProfileConfig
  searchParams: Record<string, string>
}){
  const sp = useSearchParams()
  const [lang, setLang] = useState<'tr'|'en'>(()=>{
    const q = new URLSearchParams(sp?.toString() || '')
    const l = (q.get('force_lang') || q.get('lang') || '').toLowerCase()
    return l === 'en' ? 'en' : 'tr'
  })

  // HEADER
  const [q, setQ] = useState(props.initialQuestion || '')
  const [style, setStyle] = useState<'teknik'|'resmi'>(
    (props.profileConfig?.style === 'resmi' ? 'resmi' : 'teknik')
  )
  // config-driven flags from published profile
  const strict = !!props.profileConfig?.strict_citations
  const legal = !!props.profileConfig?.add_legal_disclaimer
  const rag_mode = props.profileConfig?.rag_mode || 'off'
  const rag_params = props.profileConfig?.rag_params || null
  const rag = !!(rag_mode && rag_mode !== 'off')

  // temp_texts + temp_files_base64 (prefill)
  const [tempTexts, setTempTexts] = useState<string[]>([''])
  const [tempFiles, setTempFiles] = useState<TempFile[]>([])
  function setTempText(idx: number, value: string){
    setTempTexts(prev => prev.map((t,i)=> i===idx ? value : t))
  }
  useEffect(()=>{
    if ((props.initialTempFiles?.length || 0) > 0 && tempFiles.length === 0){
      setTempFiles(props.initialTempFiles)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialTempFiles])

  // RIGHT
  const [resText, setResText] = useState('')
  const [tokens, setTokens] = useState<{prompt:number, completion:number}|null>(null)
  const [cost, setCost] = useState<number|null>(null)
  const [loading, setLoading] = useState(false)
  const [sumLoading, setSumLoading] = useState(false)
  const [sources, setSources] = useState<EvidenceItem[]>([])
  const [quality, setQuality] = useState<QualityInfo | null>(null)
  const [copied, setCopied] = useState<null|boolean>(null)

  function buildQsWithLang(targetLang: 'tr'|'en' = lang){
    const qsp = new URLSearchParams(sp?.toString() || '')
    qsp.set('lang', targetLang)
    qsp.set('force_lang', targetLang)
    return '?' + qsp.toString()
  }
  function langHeader(targetLang: 'tr'|'en' = lang){
    return targetLang === 'en' ? 'en-US,en;q=0.9' : 'tr-TR,tr;q=0.9'
  }

  const exportMarkdown = useMemo(()=>{
    const lines: string[] = []
    if (resText?.trim()) {
      lines.push('## Sonuç', resText.trim())
    }
    if (Array.isArray(sources) && sources.length>0){
      lines.push('', '## Kaynaklar')
      for (const s of sources) {
        if (!s) continue
        const label = s.label || ''
        const ex = s.excerpt ? `: ${s.excerpt}` : ''
        lines.push(`- **${label}**${ex}`)
      }
    }
    if (quality){
      const ragLine = 'RAG: ' + (quality.used_rag ? 'evet' : 'hayir') + (quality.rag_error ? (' (hata: ' + quality.rag_error + ')') : '')
      lines.push('', '## RAG', ragLine)
    }
    return lines.join('\n')
  }, [resText, sources, quality])

  async function runInternal(targetLang: 'tr'|'en', englishHint: boolean){
    setLang(targetLang)
    setLoading(true)
    setResText(''); setTokens(null); setCost(null); setSources([]); setQuality(null); setCopied(null)
    const hint = englishHint && targetLang==='en' ? 'Please answer in English\n\n' : ''

    const body: any = {
      question_text: hint + q,
      lang: targetLang, style,
      strict_citations: strict, legal_disclaimer: legal,
      rag, rag_mode, rag_params,
      force_lang: targetLang,
      profile_version: {
        profile_id: props.profileConfig?.profile_id || null,
        version_tag: props.profileConfig?.version_tag || null,
        model: props.profileConfig?.model || null,
        temperature: props.profileConfig?.temperature || null,
        max_tokens: props.profileConfig?.max_tokens || null,
        top_p: props.profileConfig?.top_p || null,
        output_schema: props.profileConfig?.output_schema || null,
      }
    }
    const tts = tempTexts.filter(t=>t && t.trim())
    if (tts.length) body.temp_texts = tts
    if (tempFiles.length) body.temp_files_base64 = tempFiles
    try{
      const r = await fetch('/api/admin/gpt-answers/run' + buildQsWithLang(targetLang), {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'X-Force-Lang': targetLang, 'X-Lang': targetLang, 'Accept-Language': langHeader(targetLang) },
        body: JSON.stringify(body)
      })
      const j = await r.json().catch(()=>({ok:false}))
      if (!j?.ok){
        
        alert(j?.error || 'Üretim başarısız')
        setLoading(false)
        return
      }
      setResText(j.data?.text || '')
      setTokens(j.data?.tokens || null)
      setCost(j.data?.cost_usd ?? null)
      setSources(j.data?.sources || [])
      setQuality(j.data?.quality || null)
    } catch(e:any){
      
      alert('Üretim istisnası: ' + (e?.message || String(e)))
    } finally {
      setLoading(false)
    }
  }
  async function run(){ return runInternal(lang, false) }
  async function runEnglish(){ return runInternal('en', true) }

  async function summarize(){
    setSumLoading(true)
    try{
      const r = await fetch('/api/admin/gpt-answers/summarize' + buildQsWithLang(), {
        method:'POST',
        headers:{'Content-Type':'application/json', 'X-Force-Lang': lang, 'X-Lang': lang, 'Accept-Language': langHeader()},
        body: JSON.stringify({ text_md: resText, lang, target_ratio: 0.65, keep_citations: true })
      })
      const j = await r.json().catch(()=>({ok:false}))
      if(j?.ok){ setResText(j.data?.text || '') }
      else {
        
        alert(j?.error || 'Özetleme başarısız')
      }
    } catch(e:any){
      
      alert('Özet istisnası: ' + (e?.message || String(e)))
    } finally { setSumLoading(false) }
  }

  // NEW: Copy to clipboard including sources (exportMarkdown) and Go to Editor (request root, only email param)
  async function copyAll(){
    const text = exportMarkdown || ''
    if (!text.trim()){ setCopied(false); return }
    try {
      if (navigator?.clipboard?.writeText){
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus(); ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
    } catch (e){
      
      setCopied(false)
      alert('Kopyalama başarısız')
    }
  }
  function goToEditor(){
    const qsp = new URLSearchParams(sp?.toString() || '')
    const email = qsp.get('email')
    const qs = email ? `?email=${encodeURIComponent(email)}` : ''
    window.open(`/admin/request/${props.questionId}${qs}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* H1 */}
      <div className="md:col-span-2">
        <h1 className="text-2xl font-bold">HIZLI TASLAK</h1>
      </div>

      {/* LEFT: options (no language selector) */}
      <div className="p-4 border rounded-md">
        <div className="grid gap-2 mb-2">
          <label className="flex items-center gap-2"><span className="w-28">Stil</span>
            <select value={style} onChange={(e)=>setStyle(e.target.value as 'teknik'|'resmi')} className="border rounded px-2 py-1">
              <option value="teknik">Teknik</option><option value="resmi">Resmî</option>
            </select>
          </label>
        </div>

        <div className="mb-2">
          <div className="text-xs text-gray-600 mb-1">Soru</div>
          <textarea className="w-full border rounded p-2 h-28" value={q} onChange={e=>setQ(e.target.value)} />
        </div>

        {/* Ek Metinler */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-600">Ek Metinler</div>
            <button onClick={()=>setTempTexts(v=>[...v, ''])} className="text-xs border rounded px-2 py-1">Ekle</button>
          </div>
          {tempTexts.map((t, i)=>(
            <div key={i} className="flex items-start gap-2">
              <textarea className="w-full border rounded p-2 h-16" value={t} onChange={e=>setTempText(i, e.target.value)} />
              <button onClick={()=>setTempTexts(v=> v.filter((_,idx)=> idx!==i))} className="text-xs border rounded px-2 py-1">Sil</button>
            </div>
          ))}
        </div>

        {/* Dosya Ekleri */}
        <div className="space-y-2 mt-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-600">Dosya Ekleri</div>
            <label className="text-xs border rounded px-2 py-1 cursor-pointer">
              Dosya Seç
              <input type="file" className="hidden" multiple onChange={(e)=>{
                const files = e.target.files
                if (!files || !files.length) return
                const list = Array.from(files)
                Promise.all(list.map(async (f)=>{
                  const b = await f.arrayBuffer()
                  let b64 = ''
                  try {
                    b64 = btoa(String.fromCharCode(...new Uint8Array(b)))
                  } catch {
                    // bazı ortamlarda btoa yoksa dene
                    try { /* @ts-ignore */ b64 = Buffer.from(new Uint8Array(b)).toString('base64') } catch {}
                  }
                  return { name: f.name, b64, type: f.type || null, size: f.size }
                })).then(items=> setTempFiles(prev=> [...prev, ...items]))
              }} />
            </label>
          </div>
          {tempFiles.length ? (
            <ul className="divide-y border rounded">
              {tempFiles.map((f, i)=>(
                <li key={i} className="p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{f.name}</div>
                    <div className="text-[11px] text-gray-500">{prettySize(f.size)} · {f.type || 'dosya'}</div>
                  </div>
                  <button onClick={()=>setTempFiles(v=> v.filter((_,idx)=> idx!==i))} className="text-xs border rounded px-2 py-1">Kaldır</button>
                </li>
              ))}
            </ul>
          ) : <div className="text-xs text-gray-500">—</div>}
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button onClick={run} disabled={loading || !q.trim()} className="border rounded px-3 py-1.5 text-sm disabled:opacity-50">
            {loading ? 'Üretiliyor…' : 'Üret'}
          </button>
          <button onClick={runEnglish} disabled={loading || !q.trim()} className="border rounded px-3 py-1.5 text-sm disabled:opacity-50">
            ENG üret
          </button>
          <button onClick={summarize} disabled={sumLoading || !resText.trim()} className="border rounded px-3 py-1.5 text-sm disabled:opacity-50">
            {sumLoading ? 'Özetleniyor…' : 'Özetle'}
          </button>
          <button onClick={copyAll} disabled={!resText.trim()} className="border rounded px-3 py-1.5 text-sm disabled:opacity-50">
            {copied === true ? 'Kopyalandı' : 'Kopyala'}
          </button>
          <button onClick={goToEditor} className="border rounded px-3 py-1.5 text-sm">
            Editöre Git
          </button>
        </div>
      </div>

      {/* RIGHT */}
      <div className="border rounded p-3">
        <div className="text-xs text-gray-600 mb-1">Sonuç</div>
        <textarea className="w-full border rounded p-2 h-72" value={resText} onChange={e=>setResText(e.target.value)} />

        <h4 className="font-semibold mt-4">Kaynaklar</h4>
        {Array.isArray(sources) && sources.length>0 ? (
          <ul className="list-disc pl-5">
            {sources.map((s, i)=>(
              <li key={i} className="text-sm">
                <b>{s.label}</b>{s.excerpt ? `: ${s.excerpt}` : ''}
              </li>
            ))}
          </ul>
        ) : <div className="text-sm text-gray-500">—</div>}
      </div>
    </div>
  )
}
