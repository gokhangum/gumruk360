// app/api/admin/questions/[id]/revisions/[revId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import { isAdmin } from '@/lib/auth/requireAdmin'

type Params = { id: string; revId: string }

export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { id: questionId, revId } = await params
  const url = new URL(req.url)
  const adminEmail = url.searchParams.get('email') || ''

  if (!questionId || !revId) {
    return NextResponse.json({ ok: false, error: 'Missing ids' }, { status: 400 })
  }
  if (adminEmail && !isAdmin(adminEmail)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from('revisions')
    .select('*')
    .eq('id', revId)
    .eq('question_id', questionId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: 'Revision not found' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    data: {
      id: data.id,
      question_id: data.question_id,
      content: data.content ?? '',
      revision_no:
        typeof (data as any).revision_no === 'number'
          ? (data as any).revision_no
          : (data as any).version ?? null,
      created_at: data.created_at ?? null,
      created_by: data.created_by ?? null,
      source: data.source ?? null,
    },
  })
}
