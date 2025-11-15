
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function J(ok:boolean, data:any={}, status=200){
  return NextResponse.json({ ok, ...data }, { status, headers: { 'x-debug-route': 'rag/upload' } })
}
function sb(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url || !key) return null
  return createClient(url, key, { auth: { persistSession:false } })
}

const OPENAI_URL = 'https://api.openai.com/v1'
const OPENAI_KEY = process.env.OPENAI_API_KEY

async function embed(text: string): Promise<number[]|null> {
  if (!OPENAI_KEY) return null
  const r = await fetch(`${OPENAI_URL}/embeddings`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text })
  })
  const j = await r.json().catch(()=>null as any)
  if (!r.ok || !j?.data?.[0]?.embedding) return null
  return j.data[0].embedding
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

async function extractText(file: File): Promise<{text:string, note?:string}> {
  const buf = Buffer.from(await file.arrayBuffer())
  const ct = (file.type || '').toLowerCase()
  const name = file.name.toLowerCase()

  if (ct.includes('wordprocessingml') || name.endsWith('.docx')) {
    try {
      const mammoth = await import('mammoth')
      const res = await mammoth.extractRawText({ buffer: buf })
      return { text: String(res?.value || '').trim(), note: 'docx:mammoth' }
    } catch (e:any) {
      throw new Error('DOCX işlemek için "mammoth" paketini kurun: npm i mammoth')
    }
  }

  if (ct === 'application/pdf' || name.endsWith('.pdf')) {
    try {
      const pdfParse = ((await import('pdf-parse')) as any).default as any
      const res = await pdfParse(buf)
      return { text: String(res?.text || '').trim(), note: 'pdf:pdf-parse' }
    } catch (e:any) {
      throw new Error('PDF işlemek için "pdf-parse" paketini kurun: npm i pdf-parse')
    }
  }

  if (ct.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
    return { text: buf.toString('utf-8'), note: 'text' }
  }

  if (name.endsWith('.html') || ct.includes('html')) {
    const html = buf.toString('utf-8')
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    return { text, note: 'html-strip' }
  }

  // fallback
  return { text: buf.toString('utf-8'), note: 'fallback-binary->utf8' }
}

export async function POST(req: NextRequest){
  const c = sb(); if(!c) return J(false, { error: 'Supabase env eksik' }, 500)
  const form = await req.formData().catch(()=>null)
  if(!form) return J(false, { error:'multipart/form-data bekleniyordu' }, 400)

  const file = form.get('file')
  if (!file || !(file instanceof File)) return J(false, { error:'file gerekli' }, 400)

  const title = String(form.get('title') || (file as File).name || 'Untitled').slice(0,256)
  const source = String(form.get('source') || 'upload').slice(0,64)
  const url = form.get('url') ? String(form.get('url')) : null
  const chunkSize = Number(form.get('chunk_size') || 1200)
  const overlap = Number(form.get('overlap') || 150)

  let extracted: {text:string, note?:string}
  try { extracted = await extractText(file as File) } catch(e:any){ return J(false, { error: String(e?.message||e) }, 400) }
  if (!extracted.text || extracted.text.trim().length < 10) return J(false, { error: 'Metin çıkarılamadı veya çok kısa' }, 400)

  const parts = chunkText(extracted.text, chunkSize, overlap)
  if (parts.length === 0) return J(false, { error:'Parça oluşmadı' }, 400)

  const { data: doc, error: docErr } = await c.from('rag_documents').insert([{
    source, title, url, jurisdiction: 'TR', tags: [], hash: null
  }]).select('id').maybeSingle()
  if (docErr || !doc?.id) return J(false, { error: 'doc insert: ' + String(docErr?.message || 'yok') }, 500)

  let ok=0
  for (let i=0;i<parts.length;i++){
    const p = parts[i]
    const emb = await embed(p)
    const row:any = {
      doc_id: doc.id, document_id: doc.id, idx: i,
      content: p, token_count: null, embedding: emb, metadata: { title, url, source }
    }
    const { error: insErr } = await c.from('rag_chunks').insert([row])
    if (insErr) return J(false, { error:'chunk insert: ' + insErr.message, document_id: doc.id, inserted: ok }, 500)
    ok++
  }

  try { await c.from('audit_logs').insert({ action:'rag.ingest.upload', resource_type:'rag_documents', resource_id: String(doc.id), event:'created', metadata:{ title, source, url, parts: ok }, actor_role:'system' } as any) } catch {}

  return J(true, { document_id: doc.id, chunks: ok, note: extracted.note })
}
