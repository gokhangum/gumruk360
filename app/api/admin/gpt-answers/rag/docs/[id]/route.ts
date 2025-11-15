// app/api/admin/gpt-answers/rag/docs/[id]/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function J(ok:boolean, data:any={}, status=200){
  return NextResponse.json({ ok, ...data }, { status, headers: { 'x-debug-route': 'admin/gpt-answers/rag/docs/[id]' } })
}

function sb(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url || !key) return null
  return createClient(url, key, { auth: { persistSession:false } })
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
){
   const c = sb(); if(!c) return J(false, { error: 'Supabase env eksik: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500)
   const { id } = await context.params
   if(!id) return J(false, { error: 'id gerekli' }, 400)


  try{
    // Önce chunk'ları sil (varsa)
    try { await c.from('rag_chunks').delete().eq('document_id', id) } catch {}

    // Sonra dokümanı sil
    const { error: dErr } = await c.from('rag_documents').delete().eq('id', id)
    if (dErr) return J(false, { error: 'rag_documents silinemedi: ' + dErr.message }, 500)

    // Best-effort audit
    try { await c.from('audit_logs').insert({ action:'rag.documents', resource_id: id, event:'deleted' } as any) } catch {}

    return J(true, { id })
  }catch(e:any){
    return J(false, { error: String(e?.message||e) }, 500)
  }
}
