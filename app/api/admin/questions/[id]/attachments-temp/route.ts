// app/api/admin/questions/[id]/attachments-temp/route.ts
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

function bufToB64(b: ArrayBuffer): string {
  const bytes = new Uint8Array(b)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any)
  }
  return Buffer.from(binary, 'binary').toString('base64')
}

// NOTE: Next.js 15 -> params must be awaited
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }){
  const { id } = await ctx.params
  const c = sb(); if(!c) return J(false, { error: 'Supabase env eksik' }, 500)
  try{
    const { data: rows, error } = await c
      .from('attachments')
      .select('id, bucket, object_path, file_name, file_size, mime, content_type')
      .eq('question_id', id)
      .eq('scope', 'question')
      .order('created_at', { ascending: true })

    if (error) return J(false, { error: error.message }, 500)

    const out: any[] = []

    for (const r of rows || []){
      try{
        const bucket = (r as any).bucket || 'attachments'
        const key = (r as any).object_path || (r as any).file_name
        if (!key) continue
        const down = await c.storage.from(bucket).download(key)
        if ((down as any).error) throw (down as any).error
        const arr = await (down as any).arrayBuffer()
        const b64 = bufToB64(arr)
        out.push({
          id: (r as any).id,
          name: (r as any).file_name || key,
          size: (r as any).file_size || null,
          type: (r as any).mime || (r as any).content_type || null,
          b64,
        })
        if (out.length >= 8) break
      }catch{ /* tek dosya hatası yutulur */ }
    }

    return J(true, { temp_files_base64: out })
  }catch(e:any){
    return J(false, { error: String(e?.message||e) }, 500)
  }
}
