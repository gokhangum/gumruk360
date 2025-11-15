export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}
const ok = (data:any={}, status=200) => NextResponse.json({ ok:true, ...data }, { status })
const bad = (msg:string, status=400) => NextResponse.json({ ok:false, error: msg }, { status })

export async function HEAD(){ return new NextResponse(null, { status:204 }) }
export async function OPTIONS(){ return new NextResponse(null, { status:204 }) }

export async function GET(req: NextRequest){
  const c = client(); if(!c) return bad('Supabase env eksik', 500)
  try{
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (id) {
      const { data, error } = await c.from('gpt_prompt_blocks')
        .select('id,key,title,body,lang,metadata').eq('id', id).maybeSingle()
      if (error) return bad(`Blok okunamadı: ${error.message}`, 500)
      return ok({ rows: data ? [data] : [] })
    }
    const { data, error } = await c.from('gpt_prompt_blocks')
      .select('id,key,title,body,lang,metadata').eq('scope','global').order('title',{ascending:true})
    if (error) return bad(`Listeleme hatası: ${error.message}`, 500)
    return ok({ rows: data||[] })
  }catch(e:any){ return bad(String(e?.message||e), 500) }
}

export async function POST(req: NextRequest){
  const c = client(); if(!c) return bad('Supabase env eksik', 500)
  try{
    const body = await req.json().catch(()=>({}))
    const { key, title, body: text, lang='tr', metadata={} } = body || {}
    if(!key || !title || !text) return bad('key, title, body zorunlu')
    const payload = { scope:'global', key, title, body: text, lang, metadata }
    const { data, error } = await c.from('gpt_prompt_blocks').insert([payload]).select('id').maybeSingle()
    if (error) return bad(`Ekleme hatası: ${error.message}`, 500)
    return ok({ id: data?.id })
  }catch(e:any){ return bad(String(e?.message||e), 500) }
}
