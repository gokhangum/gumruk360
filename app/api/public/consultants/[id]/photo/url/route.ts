export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supa = supabaseAdmin

  // try to read stored photo path first
  const { data: profile } = await supa
    .from('worker_cv_profiles')
    .select('photo_object_path')
    .eq('worker_user_id', id)
    .maybeSingle()

  const rawPath = profile?.photo_object_path || `workers-cv/${id}/profile.jpg`
  const path = rawPath.replace(/^workers-cv\//,'')
  const { data: signed, error } = await supa.storage.from('workers-cv').createSignedUrl(path, 60 * 10)
  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok:true, url: signed?.signedUrl || null })
}