// app/api/admin/gpt-answers/rag/docs/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function J(ok:boolean, data:any={}, status=200){
  return NextResponse.json({ ok, ...data }, { status, headers: { 'x-debug-route': 'admin/gpt-answers/rag/docs' } })
}

function sb(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url || !key) return null
  return createClient(url, key, { auth: { persistSession:false } })
}

export async function GET(req: NextRequest){
  const c = sb(); if(!c) return J(false, { error: 'Supabase env eksik: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500)
  try{
    const url = new URL(req.url)
    const limit = Number(url.searchParams.get('limit') || 200)
    const offset = Number(url.searchParams.get('offset') || 0)

    // Sadece mevcut kolonlar: id, source, title, url, jurisdiction, tags, hash, created_at
    const { data: docs, error: dErr } = await c
      .from('rag_documents')
      .select('id, source, title, url, created_at')
      .order('created_at', { ascending:false })
      .range(offset, offset + limit - 1)

    if (dErr) return J(false, { error: 'rag_documents okunamadı: ' + dErr.message }, 500)

    const ids = (docs||[]).map(d => d.id)
    const counts: Record<string, number> = {}

    if (ids.length){
      try{
        const { data: grp, error: gErr } = await c
          .from('rag_chunks')
         .select('document_id')
        .in('document_id', ids as any)
       if (!gErr && Array.isArray(grp)){
          for (const row of grp as any[]){
            const key = String((row as any).document_id)
           counts[key] = (counts[key] ?? 0) + 1
          }
        }
      }catch(_){
        // rag_chunks yoksa sessizce geç
        for (const id of ids) counts[String(id)] = counts[String(id)] || 0
      }
    }

    const rows = (docs||[]).map((d:any) => ({
      id: d.id,
      title: d.title,
      source: d.source ?? null,
      url: d.url ?? null,
      created_at: d.created_at ?? null,
      chunks: counts[String(d.id)] || 0
    }))

    return J(true, { rows })
  }catch(e:any){
    return J(false, { error: String(e?.message||e) }, 500)
  }
}
