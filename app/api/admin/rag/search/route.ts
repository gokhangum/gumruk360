// app/api/admin/rag/search/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabase/serverAdmin'
import { assertAdmin } from '../../../../../lib/auth/requireAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function embed(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: key })
  const r = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text })
  return (r.data?.[0]?.embedding as any) || null
}

export async function POST(req: Request) {
  try {
   const { searchParams } = new URL(req.url)
   const email = searchParams.get('email')
     await assertAdmin(req)

    const body = await req.json().catch(() => ({}))
    const query = String(body?.query || '')
    const topK = Number(body?.topK || 5)
    const minSim = Number(body?.minSimilarity || 0.7)

    if (!query) return NextResponse.json({ ok: false, error: 'query is required' }, { status: 400 })

    const v = await embed(query)
    if (!v) return NextResponse.json({ ok: false, error: 'embedding failed' }, { status: 500 })

    const { data, error } = await supabaseAdmin.rpc('match_rag_chunks', {
      query_embedding: v as any,
      match_count: topK,
      min_similarity: minSim,
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unexpected error' }, { status: 500 })
  }
}
