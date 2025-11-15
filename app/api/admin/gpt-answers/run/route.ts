export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function J(ok: boolean, data: any = {}, status = 200) {
  return NextResponse.json({ ok, ...data }, { status })
}

function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

const OPENAI_URL = 'https://api.openai.com/v1'
const OPENAI_KEY = process.env.OPENAI_API_KEY

type EvidenceItem = { label: string; excerpt?: string; url?: string|null }

const SAFE_MODELS = ['gpt-4.1','gpt-4.1-mini','gpt-4o','gpt-4o-mini'] as const
type SafeModel = typeof SAFE_MODELS[number]
function ensureModel(m?: string): SafeModel {
  return (SAFE_MODELS as readonly string[]).includes(String(m)) ? (m as SafeModel) : 'gpt-4.1-mini'
}

function replaceVars(s: string, vars: Record<string,string>): string {
  return s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => (k in vars ? String(vars[k]) : _m))
}

function countBracketed(text: string): number {
  const m = text.match(/\[[^\[\]\n]{1,120}\]/g)
  return m ? m.length : 0
}

// ------------- cosine helpers -------------
function dot(a: number[], b: number[]) {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i=0;i<n;i++) s += a[i]*b[i]
  return s
}
function norm(a: number[]) {
  let s = 0
  for (let i=0;i<a.length;i++) s += a[i]*a[i]
  return Math.sqrt(s)
}
function cosine(a: number[], b: number[]) {
  const d = dot(a,b); const na = norm(a)||1; const nb = norm(b)||1
  return d/(na*nb)
}

// ------------- embeddings + rag -------------
async function embed(text: string): Promise<number[]|null> {
  if (!OPENAI_KEY) return null
  const r = await fetch(`${OPENAI_URL}/embeddings`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: text, model: 'text-embedding-3-small' })
  })
  const j = await r.json().catch(()=>null as any)
  if (!r.ok || !j?.data?.[0]?.embedding) return null
  return j.data[0].embedding as number[]
}

async function retrieve(c: any, rag_mode: 'off'|'rag'|'hybrid', question: string) {
  const out: { evidence: EvidenceItem[], error?: string } = { evidence: [] }
  if (rag_mode === 'off') return out
  try {
    const qEmb = await embed(question)
    if (!qEmb) { out.error = 'embedding_failed'; return out }
    if (rag_mode === 'hybrid') {
      const { data, error } = await c.rpc('match_rag_chunks_hybrid', {
        query_embedding: qEmb, query_text: question, match_count: 8, min_cosine_sim: 0.18
      })
      if (error) { out.error = error.message || 'rpc_error_hybrid'; return out }
      if (Array.isArray(data)) {
        out.evidence = data.map((r: any) => ({
          label: r?.metadata?.title || r?.title || r?.source || 'Kaynak',
          excerpt: String(r?.content || '').slice(0, 500),
          url: r?.metadata?.url || r?.url || null
        }))
      }
    } else {
      const { data, error } = await c.rpc('match_rag_chunks', {
        query_embedding: qEmb, match_count: 8, min_similarity: 0.18
      })
      if (error) { out.error = error.message || 'rpc_error'; return out }
      if (Array.isArray(data)) {
        out.evidence = data.map((r: any) => ({
          label: r?.title || r?.source || 'Kaynak',
          excerpt: String(r?.content || '').slice(0, 500),
          url: r?.url || null
        }))
      }
    }
  } catch (e: any) {
    out.error = String(e?.message || e)
  }
  return out
}

// ------------- attachment fetch & extract -------------
function guessExtFromUrl(u: string){
  try { const p = new URL(u).pathname.toLowerCase()
    if (p.endsWith('.pdf')) return 'pdf'
    if (p.endsWith('.docx')) return 'docx'
    if (p.endsWith('.html') || p.endsWith('.htm')) return 'html'
  } catch {}
  return null
}

function chunkText(text:string, target=1200, overlap=150){
  const out:string[]=[]; let i=0
  const clean = text.replace(/\r/g,' ').replace(/\t/g,' ').replace(/\u00A0/g,' ')
  while(i<clean.length){
    let end = Math.min(i+target, clean.length)
    const cut = clean.lastIndexOf('.', end)
    if(cut > i + 300) end = Math.min(end, cut+1)
    out.push(clean.slice(i, end).trim())
    i = Math.max(end - overlap, end)
  }
  return out.filter(Boolean)
}

async function extractFromBuffer(buf: Buffer, contentType: string|null, extGuess: string|null){
  const ct = (contentType||'').toLowerCase()

  if (ct.includes('wordprocessingml') || extGuess === 'docx') {
    const mammoth = await import('mammoth')
    const res = await mammoth.extractRawText({ buffer: buf as any })
    return { text: String(res?.value || '').trim(), note: 'docx:mammoth' }
  }

  if (ct === 'application/pdf' || extGuess === 'pdf') {
    const pdfParse = (await import('pdf-parse')).default
    const res = await pdfParse(buf as any)
    return { text: String(res?.text || '').trim(), note: 'pdf:pdf-parse' }
  }

  if (ct.includes('html') || extGuess === 'html') {
    const html = buf.toString('utf-8')
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
    return { text, note: 'html-strip' }
  }

  // düz metin varsay
  return { text: buf.toString('utf-8'), note: 'text' }
}

async function fetchAttachmentText(url: string, maxBytes = 10*1024*1024){
  const out: { ok: boolean, text?: string, note?: string, error?: string } = { ok: false }
  try{
    const r = await fetch(url, { cache:'no-store' })
    if (!r.ok) { out.error = `fetch ${r.status}`; return out }
    const len = Number(r.headers.get('content-length') || 0)
    if (len && len > maxBytes) { out.error = `too_large(${len})`; return out }
    const ab = await r.arrayBuffer()
    if (ab.byteLength > maxBytes) { out.error = `too_large(${ab.byteLength})`; return out }
    const buf = Buffer.from(ab)
    const ct = r.headers.get('content-type')
    const ext = guessExtFromUrl(url)
    try{
      const ex = await extractFromBuffer(buf, ct, ext)
      const text = (ex.text||'').trim()
      if (!text || text.length < 10) { out.error = 'empty_text'; return out }
      out.ok = true; out.text = text; out.note = ex.note
      return out
    }catch(e:any){
      out.error = String(e?.message||e); return out
    }
  }catch(e:any){
    out.error = String(e?.message||e); return out
  }
}

// rank attachment chunks by cosine similarity to question
async function selectAttachmentEvidence(question: string, attachments: Array<{ url: string, title?: string }>, topK = 8, chunkSize=1200, overlap=150){
  const out: { items: EvidenceItem[] } = { items: [] }
  if (!attachments || !attachments.length) return out
  const qEmb = await embed(question)
  if (!qEmb) { return out }

  const scored: Array<{ score: number, label: string, excerpt: string, url: string }> = []
  for (const a of attachments) {
    const fetched = await fetchAttachmentText(a.url)
    if (!fetched.ok || !fetched.text) { continue }
    const chunks = chunkText(fetched.text, chunkSize, overlap)
    for (const ch of chunks) {
      const emb = await embed(ch)
      if (!emb) continue
      const s = cosine(qEmb, emb)
      scored.push({ score: s, label: a.title || a.url, excerpt: ch.slice(0, 500), url: a.url })
    }
  }
  scored.sort((x,y)=>y.score - x.score)
  const sel = scored.slice(0, topK)
  out.items = sel.map(s => ({ label: s.label, excerpt: s.excerpt, url: s.url }))
  
  return out
}

/**
 * Build ephemeral (non-persistent) evidence from temp_texts and temp_files_base64.
 * This does not hit DB; it only parses request body.
 */
async function selectTempEvidence(body: any): Promise<{ items: EvidenceItem[] }>{
  const items: EvidenceItem[] = []
 
  try{
    const chunkSize = Number(body?.chunk_size) || 1200
    const texts: any[] = Array.isArray(body?.temp_texts) ? body.temp_texts : []
    for (let i=0;i<texts.length;i++){
      const t = (typeof texts[i]==='string') ? texts[i].trim() : ''
      if (!t) continue
      const excerpt = chunkText(t, chunkSize, 150)[0] || t.slice(0, 500)
      items.push({ label: `Geçici Metin ${i+1}`, excerpt })
     
      if (items.length >= 8) break
    }
    if (items.length < 8){
      const files: any[] = Array.isArray(body?.temp_files_base64) ? body.temp_files_base64 : []
      for (let i=0;i<files.length;i++){
        const f = files[i]; 
        if (!f || typeof f.b64 !== 'string' || !f.b64.length) continue
        const name = String(f.name || `temp_${i+1}`)
       const type = (typeof f.type==='string' && f.type) ? f.type : null
        const extStr = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
       const ext = extStr ? extStr.toLowerCase() : null
       try{
          const buf = Buffer.from(f.b64, 'base64')

          const got = await extractFromBuffer(buf as any, type, ext)
          const text = String(got?.text || '').trim()
          if (!text) continue
          const excerpt = chunkText(text, chunkSize, 150)[0] || text.slice(0, 500)
          items.push({ label: name, excerpt })
         
          if (items.length >= 12) break
        }catch{ /* ignore single file failure */ }
      }
    }
  }catch{ /* silent */ }
  return { items }
}


// ------------- main -------------
export async function POST(req: NextRequest) {
  const c = sbAdmin()
  if (!c) return J(false, { error: 'Supabase environment eksik' }, 500)

  let body: any = {}; try { body = await req.json() } catch {}

  const question_text = String(body?.question_text || '').trim()
  if (!question_text) return J(false, { error: 'question_text gerekli' }, 400)

  // aktif profil + versiyon
  let profile_id = body?.profile_id as string | undefined
  if (!profile_id) {
    const { data: prof } = await c.from('gpt_answer_profiles').select('id').eq('is_active', true).maybeSingle()
    profile_id = prof?.id || undefined
  }
  if (!profile_id) {
    const { data: anyProf } = await c.from('gpt_answer_profiles').select('id').limit(1).maybeSingle()
    profile_id = anyProf?.id || undefined
  }
  if (!profile_id) return J(false, { error: 'Aktif profil bulunamadı' }, 400)

  const explicitVersionId = body?.profile_version_id as string | undefined
  let version: any = null
  if (explicitVersionId) {
    const { data } = await c.from('gpt_answer_profile_versions').select('*').eq('id', explicitVersionId).maybeSingle()
    version = data || null
  }
  if (!version) {
    const { data } = await c.from('gpt_answer_profile_versions').select('*').eq('profile_id', profile_id).eq('status','published').order('created_at',{ascending:false}).maybeSingle()
    version = data || null
  }
  if (!version) {
    const { data } = await c.from('gpt_answer_profile_versions').select('*').eq('profile_id', profile_id).order('created_at',{ascending:false}).maybeSingle()
    version = data || null
  }
  if (!version) return J(false, { error: 'Aktif versiyon bulunamadı' }, 400)

  // bloklar
  let blocks: Array<{key?:string,title?:string,body?:string,lang?:string}> = []
  try {
    const { data: sel } = await c.from('gpt_profile_blocks')
      .select('sort_order, enabled, gpt_prompt_blocks (key, title, body, lang)')
      .eq('profile_version_id', version.id)
      .eq('enabled', true)
      .order('sort_order', { ascending: true })
    blocks = (sel||[]).map((r: any) => r.gpt_prompt_blocks || {}).filter((b:any)=>b && b.body)
  } catch {}

  // konfig
  const lang: 'tr'|'en' = (body?.lang === 'en') ? 'en' : (version.lang as 'tr'|'en') || 'tr'
  const style: 'teknik'|'resmi' = (body?.style === 'resmi') ? 'resmi' : ((version.style as 'teknik'|'resmi') || 'teknik')
  const strict = (typeof body?.strict_citations === 'boolean') ? !!body.strict_citations : !!version.strict_citations
  const legal = (typeof body?.legal_disclaimer === 'boolean') ? !!body.legal_disclaimer : !!version.add_legal_disclaimer
  let rag_mode: 'off'|'rag'|'hybrid' =
    typeof body?.rag === 'boolean' ? (body.rag ? 'rag' : 'off') :
    (typeof body?.rag_mode === 'string' && ['off','rag','hybrid'].includes(body.rag_mode)) ? body.rag_mode :
    (version.rag_mode || 'off')

  const model: SafeModel = ensureModel(body?.model || version.model)
  const temperature: number = (typeof body?.temperature === 'number') ? body.temperature : (Number(version.temperature) || 0.2)
  const max_tokens: number = (typeof body?.max_tokens === 'number') ? body.max_tokens : (Number(version.max_tokens) || 1024)

  // attachments
  const attachments: Array<{ url: string, title?: string }> = Array.isArray(body?.attachments) ? body.attachments.filter((a:any)=>a && a.url) : []
  let attachEvidence: EvidenceItem[] = []
  
  if (attachments.length) {
    const sel = await selectAttachmentEvidence(question_text, attachments, 8, Number(body?.chunk_size)||1200, Number(body?.overlap)||150)
    attachEvidence = sel.items
  
}

  
  // Geçici eklerden evidence (DB'ye yazılmaz) — her durumda mevcut
  let tempEvidence: EvidenceItem[] = []
  try {
    const tempSel = await selectTempEvidence(body)
    tempEvidence = Array.isArray(tempSel?.items) ? tempSel.items : []
  } catch { /* ignore */ }


// --- Normalize regulation evidence (e.g., "Gümrük Yönetmeliği") ---
function cleanRegulatoryArtifacts(s: string): string{
  if (!s) return s
  let out = s
  // Remove header/footer artifacts commonly extracted from DOCX/PDF
  out = out.replace(/\bFormun\s+Altı\b/gi, '')
  out = out.replace(/\bFormun\s+Üstü\b/gi, '')
  // Collapse excessive whitespace
  out = out.replace(/[\t\f\r]+/g, ' ')
  out = out.replace(/\s{2,}/g, ' ').trim()
  // Normalize "MADDE 153-" like headings dash variants to an em dash
  out = out.replace(/(MADDE\s+\d+[A-Za-z]?)\s*[-–—:]\s*/gi, '$1 — ')
  return out
}

function relabelIfArticle(e: EvidenceItem): EvidenceItem{
  try{
    const src = (e.label||'') + ' ' + (e.url||'')
    const ex = e.excerpt || ''
    const m = ex.match(/MADDE\s+(\d+[A-Za-z]?)/i)
    if (m){
      const no = m[1]
      const looksGY = /g[uü]mr[uü]k\s+y[öo]netmeli[ğg]i/i.test(src) || /\bGY\b/.test(e.label||'')
      const label = looksGY ? `GY MADDE ${no}` : (e.label || `MADDE ${no}`)
      return { ...e, label, excerpt: cleanRegulatoryArtifacts(ex) }
    }
    return { ...e, excerpt: cleanRegulatoryArtifacts(ex) }
  }catch{ return e }
}

function extractArticleNoFrom(text: string): string | null {
  try{
    const m = text.match(/MADDE\s+(\d+[A-Za-z]?)/i)
    return m ? m[1] : null
  }catch{ return null }
}

// Ensure excerpt starts with "MADDE {no} — " if we can determine the article number.
// If excerpt already begins with "MADDE", we keep it (after cleanup done earlier).
function prefixArticleInExcerpt(e: EvidenceItem): EvidenceItem {
  try{
    const ex = e.excerpt || ''
    const already = /^\s*MADDE\s+\d+[A-Za-z]?\b/i.test(ex)
    if (already) return e
    // Try find article number from excerpt; if not found, try label
    const fromEx = extractArticleNoFrom(ex)
    const fromLabel = extractArticleNoFrom(e.label || '')
    const no = fromEx || fromLabel
    if (!no) return e
    // If excerpt starts with fıkra alt başlığı (a), b), ç) ...), we still prefix
    const prefixed = `MADDE ${no} — ${ex.trim()}`
    return { ...e, excerpt: prefixed }
  }catch{ return e }
}

// RAG retrieval
  const ragResult = await retrieve(c, rag_mode, question_text)
  const evidence = [...tempEvidence, ...attachEvidence, ...ragResult.evidence]

  // Clean and relabel regulation excerpts for readability
  const evidenceNorm: EvidenceItem[] = evidence.map(relabelIfArticle)
  const evidenceNorm2: EvidenceItem[] = evidenceNorm.map(prefixArticleInExcerpt)

  const used_rag_flag = (rag_mode !== 'off') || (attachments.length > 0)
  const rag_error = ragResult.error || null

  // sistem mesajları
  const sysMessages = blocks.map((b) => ({
    role: 'system',
    content: replaceVars(String(b.body || ''), { lang })
  }))

  if (evidence.length) {
    sysMessages.push({
      role: 'system',
      content: `Evidence:\n\n` + evidenceNorm2.map((e, i) => `(${i+1}) ${e.label}\n${e.excerpt}`).join('\n\n')
    } as any)
  }

  if (!OPENAI_KEY) return J(false, { error: 'OPENAI_API_KEY tanımlı değil' }, 500)
  const messages: any[] = [
    ...sysMessages,
    { role: 'user', content: question_text }
  ]

  const resp = await fetch(`${OPENAI_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, max_tokens })
  })
  const j = await resp.json().catch(()=>null as any)
  if (!resp.ok || !j) return J(false, { error: j?.error?.message || `OpenAI hata: ${resp.status}` }, 500)

  const text: string = j.choices?.[0]?.message?.content || ''
  const usage = j.usage || {}
  const tokens = { prompt: usage.prompt_tokens || 0, completion: usage.completion_tokens || 0 }

  const missing_citations_count = strict ? Math.max(0, (text.split(/\n{2,}/g).length) - countBracketed(text)) : 0

  try {
    await c.from('audit_logs').insert({
      action: 'gpt.run',
      resource_type: 'gpt_answers',
      event: 'completed',
      metadata: {
        profile_id, profile_version_id: version.id,
        attachments_count: attachments.length,
       
        rag_mode, evidence_count: evidence.length, rag_error
      }
    } as any)
  } catch {}

  return J(true, {
    data: {
      text,
      tokens,
      cost_usd: null,
      sources: evidence,
      quality: {
        used_rag: used_rag_flag,
        sources_count: evidence.length,
        missing_citations_count,
        rag_error,
        attachments_selected: attachEvidence.length
      },
      runtime: {
        profile_id,
        profile_version_id: version.id,
        model, temperature, max_tokens, rag_mode, strict_citations: strict, legal_disclaimer: legal, style, lang,
        attachments_count: attachments.length
      }
    }
  })
}
