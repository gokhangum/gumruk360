// app/api/admin/questions/[id]/info/route.ts
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

// NOTE: Next.js 15 -> params must be awaited
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }){
  const { id } = await ctx.params
  const c = sb(); if(!c) return J(false, { error: 'Supabase env eksik' }, 500)
  try{
    const { data, error } = await c
      .from('questions')
      .select('id, title, description')
      .eq('id', id)
      .maybeSingle()
    if (error) return J(false, { error: error.message }, 500)
    if (!data) return J(false, { error: 'Bulunamadı' }, 404)
    return J(true, { row: data })
  }catch(e:any){
    return J(false, { error: String(e?.message||e) }, 500)
  }
}
