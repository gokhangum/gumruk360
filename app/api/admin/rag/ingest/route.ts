export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function J(ok:boolean, data:any={}, status=200){
  return NextResponse.json({ ok, ...data }, { status })
}
function sb(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url || !key) return null
  return createClient(url, key, { auth: { persistSession:false } })
}
const OPENAI_URL = 'https://api.openai.com/v1'
const OPENAI_KEY = process.env.OPENAI_API_KEY

async function embed(text: string): Promise<number[]|null>{
  if(!OPENAI_KEY) return null
  const r = await fetch(`${OPENAI_URL}/embeddings`, {
    method:'POST',
    headers:{'Authorization':`Bearer ${OPENAI_KEY}`, 'Content-Type':'application/json'},
    body: JSON.stringify({ model:'text-embedding-3-small', input: text })
  })
  const j = await r.json().catch(()=>null as any)
  if (!r.ok || !j?.data?.[0]?.embedding) return null
  return j.data[0].embedding
}

function chunkText(text:string, target=1200, overlap=150){
  const out:string[]=[]
  let i=0
  while(i<text.length){
    let end = Math.min(i+target, text.length)
    // cümle sınırına yakın kes
    const nextDot = text.lastIndexOf('.', end)
    if(nextDot>i+300) end = Math.min(end, nextDot+1)
    out.push(text.slice(i, end).trim())
    i = Math.max(end - overlap, end)
  }
  return out.filter(Boolean)
}

export async function POST(req: NextRequest){
  const c = sb(); if(!c) return J(false, { error:'Supabase env eksik' }, 500)
  let body:any={}; try{ body = await req.json() }catch{}
  const title = (body?.title||'Untitled').toString().slice(0,256)
  const source = (body?.source||'manual').toString().slice(0,64)
  const url = typeof body?.url==='string' ? body.url : null
  const text = (body?.text||'').toString().trim()
  if(!text) return J(false, { error:'text gerekli' }, 400)

  // 1) Belge kaydı
  const { data: doc, error: docErr } = await c.from('rag_documents').insert([{
    source, title, url, jurisdiction: 'TR', tags: [], hash: null
  }]).select('id').maybeSingle()
  if(docErr || !doc?.id) return J(false, { error:`doc insert: ${docErr?.message||'yok'}` }, 500)

  // 2) Parçala + embed + chunk insert
  const parts = chunkText(text)
  let idx=0, okCount=0
  for(const p of parts){
    const emb = await embed(p)
    const row:any = {
      doc_id: doc.id, document_id: doc.id, idx,
      content: p, token_count: null, embedding: emb, metadata: { title, url, source }
    }
    const { error: insErr } = await c.from('rag_chunks').insert([row])
    if(insErr) return J(false, { error:`chunk insert: ${insErr.message}` }, 500)
    okCount++; idx++
  }

  return J(true, { document_id: doc.id, chunks: okCount })
}
