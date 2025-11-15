// app/api/admin/rag/import/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env eksik (URL veya SERVICE_ROLE_KEY yok).')
  return createClient(url, key, { auth: { persistSession: false } })
}

type ChunkIn = { content: string; metadata?: Record<string, any> }
type ImportBody = {
  // Doküman üst verileri
  tenant_id?: string | null
  lang?: 'tr' | 'en'
  source_type?: string
  source_id?: string
  title?: string
  url?: string
  // İçerik
  text?: string | null                 // tek büyük metin (otomatik parçalansın)
  chunks?: ChunkIn[] | null            // veya önceden parçalanmış içerik listesi
  // Parçalama
  chunk_size?: number                  // default 1200 char
  chunk_overlap?: number               // default 150 char
  auto_chunk_by?: 'paragraph' | 'chars' // default 'chars'
  // Davranış
  replace?: boolean                    // true ise mevcut parçaları siler
  dry_run?: boolean                    // true ise DB’ye yazmaz, yalnızca hesaplar
}

function splitByChars(text: string, chunkSize = 1200, overlap = 150): string[] {
  const t = text.trim()
  if (!t) return []
  const chunks: string[] = []
  let i = 0
  while (i < t.length) {
    const end = Math.min(i + chunkSize, t.length)
    chunks.push(t.slice(i, end))
    if (end >= t.length) break
    i = end - Math.min(overlap, chunkSize) // overlap kadar geri gel
    if (i < 0) i = 0
  }
  return chunks
}

function splitByParagraph(text: string, chunkSize = 1200): string[] {
  const paras = text.split(/\n{2,}/g).map(s => s.trim()).filter(Boolean)
  const chunks: string[] = []
  let buf = ''
  for (const p of paras) {
    if (!buf) { buf = p }
    else if ((buf + '\n\n' + p).length <= chunkSize) {
      buf = buf + '\n\n' + p
    } else {
      chunks.push(buf)
      buf = p
    }
  }
  if (buf) chunks.push(buf)
  return chunks
}

async function embedBatch(openai: OpenAI, texts: string[]): Promise<number[][]> {
  if (!texts.length) return []
  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts
  })
  // map to number[]
  return resp.data.map((d) => d.embedding as unknown as number[])
}

export async function POST(req: NextRequest) {
  try {
    // Opsiyonel gizli başlık (prod için önerilir)
    const secret = process.env.ADMIN_INTERNAL_SECRET
    if (secret && req.headers.get('x-internal-secret') !== secret) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const supabase = getAdminClient()
    const body = await req.json().catch(() => ({})) as ImportBody

    const {
      tenant_id = null,
      lang = 'tr',
      source_type = 'mevzuat',
      source_id = undefined,
      title = undefined,
      url = undefined,
      text = null,
      chunks = null,
      chunk_size = 1200,
      chunk_overlap = 150,
      auto_chunk_by = 'chars',
      replace = false,
      dry_run = false
    } = body || {}

    // Girdi doğrulama
    if (!text && (!chunks || !Array.isArray(chunks) || chunks.length === 0)) {
      return NextResponse.json({ ok: false, error: 'text veya chunks zorunlu' }, { status: 400 })
    }
    if (!title) {
      return NextResponse.json({ ok: false, error: 'title zorunlu' }, { status: 400 })
    }

    // 1) Doküman row’u bul/oluştur (aynı source_id + source_type + lang varsa güncelle)
    let docId: string | null = null
    if (source_id) {
      const { data: exist } = await supabase
        .from('rag_documents')
        .select('id')
        .eq('source_id', source_id)
        .eq('source_type', source_type)
        .eq('lang', lang)
        .maybeSingle()
      if (exist?.id) docId = exist.id
    }

    if (!dry_run) {
      if (!docId) {
        const { data: ins, error: docErr } = await supabase
          .from('rag_documents')
          .insert({
            tenant_id, source_type, source_id, title, url, lang
          })
          .select('id')
          .maybeSingle()
        if (docErr) return NextResponse.json({ ok: false, error: docErr.message }, { status: 500 })
        docId = ins?.id || null
      } else {
        // metadata güncelle (başlık/url değişmişse)
        await supabase.from('rag_documents')
          .update({ tenant_id, title, url })
          .eq('id', docId)
      }
    }

    // 2) Parçaları hazırla
    let pieces: ChunkIn[] = []
    if (text && typeof text === 'string') {
      const arr = auto_chunk_by === 'paragraph'
        ? splitByParagraph(text, chunk_size)
        : splitByChars(text, chunk_size, chunk_overlap)
      pieces = arr.map(s => ({ content: s, metadata: {} }))
    } else if (chunks) {
      pieces = (chunks || []).map(c => ({
        content: (c.content || '').toString(),
        metadata: c.metadata || {}
      })).filter(c => c.content?.trim().length > 0)
    }

    // 3) Dry run ise direkt rapor döndür
    if (dry_run) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        planned: {
          chunks: pieces.length,
          approx_chars: pieces.reduce((n, c) => n + (c.content?.length || 0), 0)
        }
      })
    }

    if (!docId) {
      return NextResponse.json({ ok: false, error: 'document creation failed' }, { status: 500 })
    }

    // 4) replace=true ise eski parçaları sil
    if (replace) {
      const del = await supabase.from('rag_chunks').delete().eq('document_id', docId)
      if (del.error) return NextResponse.json({ ok: false, error: del.error.message }, { status: 500 })
    }

    // 5) Embedding üret ve ekle (batch)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    const BATCH = 64
    let inserted = 0
    for (let i = 0; i < pieces.length; i += BATCH) {
      const slice = pieces.slice(i, i + BATCH)
      const embs = await embedBatch(openai, slice.map(s => s.content))
      // satırları hazırlayalım
      const rows = slice.map((s, idx) => ({
        document_id: docId,
        content: s.content,
        metadata: {
          ...(s.metadata || {}),
          lang,
          source_type,
          source_id,
          title
        },
        embedding: embs[idx] as unknown as any // supabase-js vector
      }))
      const ins = await supabase.from('rag_chunks').insert(rows)
      if (ins.error) {
        return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 })
      }
      inserted += rows.length
    }

    return NextResponse.json({
      ok: true,
      document_id: docId,
      inserted,
      lang,
      source_type,
      source_id,
      title
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
