export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function J(ok:boolean, data:any={}, status=200){
  return NextResponse.json({ ok, ...data }, { status, headers: { 'x-debug-route': 'rag/ingest' } })
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

export async function POST(req: NextRequest){
  const c = sb(); if(!c) return J(false, { error: 'Supabase env eksik' }, 500)
  let body:any={}; try{ body = await req.json() }catch{}
  const title = (body?.title||'Untitled').toString().slice(0,256)
  const source = (body?.source||'manual').toString().slice(0,64)
  const url = typeof body?.url==='string' ? body.url : null
  const text = (body?.text||'').toString().trim()
  const chunkSize = Number(body?.chunk_size || 1200)
  const overlap = Number(body?.overlap || 150)
  if(!text) return J(false, { error:'text gerekli' }, 400)

  const parts = chunkText(text, chunkSize, overlap)
  if (parts.length === 0) return J(false, { error:'Parça oluşmadı' }, 400)

  const { data: doc, error: docErr } = await c.from('rag_documents').insert([{
    source, title, url, jurisdiction: 'TR', tags: [], hash: null
  }]).select('id').maybeSingle()
  if (docErr || !doc?.id) return J(false, { error: `doc insert: ${docErr?.message||'yok'}` }, 500)

  let ok=0
  for (let i=0;i<parts.length;i++){
    const p = parts[i]
    const emb = await embed(p)
    const row:any = {
      doc_id: doc.id, document_id: doc.id, idx: i,
      content: p, token_count: null, embedding: emb, metadata: { title, url, source }
    }
    const { error: insErr } = await c.from('rag_chunks').insert([row])
    if (insErr) return J(false, { error:`chunk insert: ${insErr.message}`, document_id: doc.id, inserted: ok }, 500)
    ok++
  }

  try { await c.from('audit_logs').insert({ action:'rag.ingest.text', resource_type:'rag_documents', resource_id: String(doc.id), event:'created', metadata:{ title, source, url, parts: ok }, actor_role:'system' } as any) } catch {}

  return J(true, { document_id: doc.id, chunks: ok })
}
