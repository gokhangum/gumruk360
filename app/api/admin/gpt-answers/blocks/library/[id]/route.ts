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

 export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
 ){
  const c = client(); if(!c) return bad('Supabase env eksik', 500)
  const { id } = await context.params; if(!id) return bad('id gerekli')

  try{
    const body = await req.json().catch(()=>({}))
    const patch:any = {}
    if (typeof body.title === 'string') patch.title = body.title
    if (typeof body.lang === 'string') patch.lang = body.lang
    if (typeof body.body === 'string') patch.body = body.body
    if (typeof body.metadata === 'object' && body.metadata) patch.metadata = body.metadata
    if (Object.keys(patch).length === 0) return bad('Güncellenecek alan yok')
    const { error } = await c.from('gpt_prompt_blocks').update(patch).eq('id', id)
    if (error) return bad(`Güncelleme hatası: ${error.message}`, 500)
    return ok({ id })
  }catch(e:any){ return bad(String(e?.message||e), 500) }
}

 export async function DELETE(
  _req: NextRequest,
   context: { params: Promise<{ id: string }> }
){
   const c = client(); if(!c) return bad('Supabase env eksik', 500)
 const { id } = await context.params; if(!id) return bad('id gerekli')

  try{
    const { error } = await c.from('gpt_prompt_blocks').delete().eq('id', id)
    if (error) return bad(`Silme hatası: ${error.message}`, 500)
    return ok({ id })
  }catch(e:any){ return bad(String(e?.message||e), 500) }
}
