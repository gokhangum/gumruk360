// app/admin/request/[id]/hizli-uretim/page.tsx
import HizliUretimCloneClient from './HizliUretimCloneClient'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import { getTranslations } from "next-intl/server";
import { MAIL, OWNER } from "../../../../../lib/config/appEnv";
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type SearchParams = Record<string, string | string[] | undefined>

type TempFile = { name: string, b64: string, type?: string|null, size?: number|null }
type PrefillAttempt = { bucket: string, keyTried: string, ok: boolean, size?: number|null, error?: string|null, note?: string|null }
type ListAttempt = { bucket: string, prefix: string, ok: boolean, fileCount: number, error?: string|null }
type PrefillDebug = {
  questionId: string,
  rowsFromDB: number,
  listAttempts: ListAttempt[],
  attempts: PrefillAttempt[],
  errors: string[]
}

type ProfileConfig = {
  profile_id?: string|null
  version_tag?: string|null
  model?: string|null
  temperature?: number|null
  max_tokens?: number|null
  top_p?: number|null
  strict_citations: boolean
  add_legal_disclaimer: boolean
  rag_mode?: string|null
  rag_params?: any
  output_schema?: any
  style?: 'teknik'|'resmi'|string|null
  created_at?: string|null
  created_by?: string|null
}

async function loadPublishedProfileConfig(sp: SearchParams): Promise<ProfileConfig> {
  const q = supabaseAdmin.from('gpt_answer_profile_versions')
    .select('profile_id, version_tag, status, model, temperature, max_tokens, top_p, strict_citations, add_legal_disclaimer, rag_mode, rag_params, output_schema, created_at, created_by, style')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1)

  const profileId = typeof sp?.profile_id === 'string' ? sp.profile_id : Array.isArray(sp?.profile_id) ? sp.profile_id[0] : null
  const { data, error } = profileId
    ? await q.eq('profile_id', profileId)
    : await q

  if (error) {
    
  }

  const row = Array.isArray(data) && data.length ? (data as any[])[0] : null
  if (!row) {
    return {
      strict_citations: true,
      add_legal_disclaimer: true,
      rag_mode: 'off',
      rag_params: null,
      style: 'teknik',
      profile_id: null,
      version_tag: null,
      model: null,
      temperature: null,
      max_tokens: null,
      top_p: null,
      output_schema: null,
      created_at: null,
      created_by: null,
    }
  }

  return {
    profile_id: row.profile_id ?? null,
    version_tag: row.version_tag ?? null,
    model: row.model ?? null,
    temperature: row.temperature ?? null,
    max_tokens: row.max_tokens ?? null,
    top_p: row.top_p ?? null,
    strict_citations: !!row.strict_citations,
    add_legal_disclaimer: !!row.add_legal_disclaimer,
    rag_mode: row.rag_mode ?? null,
    rag_params: row.rag_params ?? null,
    output_schema: row.output_schema ?? null,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    style: row.style ?? 'teknik',
  }
}

// storage download helpers
async function dataToBuffer(data: any): Promise<Buffer> {
  if (!data) throw new Error('download returned empty data')
  if (typeof (data as any).arrayBuffer === 'function') {
    const ab = await (data as any).arrayBuffer()
    return Buffer.from(ab)
  }
  if (typeof (data as any).getReader === 'function') {
    const reader = (data as any).getReader()
    const chunks: Buffer[] = []
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks)
  }
  if (typeof (data as any).pipe === 'function') {
    const stream = data as any
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject)=>{
      stream.on('data', (c: any)=> chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
      stream.on('end', ()=> resolve())
      stream.on('error', (e: any)=> reject(e))
    })
    return Buffer.concat(chunks)
  }
  if (Buffer.isBuffer(data)) return data
  throw new Error('unknown data type from storage.download')
}

async function downloadBase64(bucket: string, key: string){
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(key)
  if (error || !data) throw error ?? new Error('null download')
  const buf = await dataToBuffer(data)
  return buf.toString('base64')
}

function candidateKeys(row: any, qid: string): string[] {
  const cands: string[] = []
  if (row?.object_path) cands.push(String(row.object_path))
  if (row?.file_path && !cands.includes(row.file_path)) cands.push(String(row.file_path))
  if (row?.file_name) {
    const fname = String(row.file_name)
    if (fname.includes('/')) {
      if (!cands.includes(fname)) cands.push(fname)
    }
    cands.push(`${qid}/${fname}`)
  }
  return [...new Set(cands.filter(Boolean))]
}

async function tryDBThenStoragePrefill(qid: string, prefillDebug: PrefillDebug){
  const initialTempFiles: TempFile[] = []

  const { data: rows, error: aErr } = await supabaseAdmin
    .from('attachments')
    .select('id, question_id, bucket, object_path, file_path, file_name, file_size, size, mime, content_type, scope, created_at')
    .eq('question_id', qid)
    .eq('scope', 'question')
    .order('created_at', { ascending: true })

  if (aErr) prefillDebug.errors.push(`attachments fetch error: ${aErr.message}`)
  const rowsLen = rows?.length || 0
  prefillDebug.rowsFromDB = rowsLen

  if (rowsLen > 0){
    for (const r of rows!) {
      const bucket = r?.bucket || 'attachments'
      const keys = candidateKeys(r, qid)
      let ok = false
      let usedKey = ''
      let b64 = ''
      let lastErr: string|null = null

      for (const key of keys) {
        try {
          b64 = await downloadBase64(bucket, key)
          ok = true
          usedKey = key
          break
        } catch (e: any) {
          lastErr = e?.message || String(e)
          prefillDebug.attempts.push({ bucket, keyTried: key, ok: false, error: lastErr, note: 'DB row path try' })
        }
      }

      if (ok) {
        prefillDebug.attempts.push({ bucket, keyTried: usedKey, ok: true, size: r?.file_size ?? r?.size ?? null, note: 'DB row picked' })
        initialTempFiles.push({
          name: r?.file_name || usedKey.split('/').pop() || usedKey,
          size: r?.file_size ?? r?.size ?? null,
          type: r?.mime || r?.content_type || null,
          b64,
        })
      } else {
        prefillDebug.errors.push(`DB attachment ${r?.id || '(no-id)'} indirilemedi; tried: ${keys.join(' | ')}; lastErr: ${lastErr}`)
      }

      if (initialTempFiles.length >= 12) break
    }
    return initialTempFiles
  }

  // 2) FALLBACK — Storage listing under attachments/<qid> (try both qid and qid/)
  const bucket = 'attachments'
  const prefixes = [qid, `${qid}/`]
  for (const prefix of prefixes){
    try {
      const { data: list, error: lErr } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } as any })
      if (lErr) {
        prefillDebug.attempts.push({ bucket, keyTried: prefix, ok: false, error: lErr.message, note: 'list error' })
        continue
      }
      const files = (list || []).filter((x: any) => x?.name && x?.metadata && typeof x.metadata.size === 'number')
      for (const f of files) {
        const key = `${prefix.replace(/\/$/, '')}/${f.name}`
        try {
          const b64 = await downloadBase64(bucket, key)
          prefillDebug.attempts.push({ bucket, keyTried: key, ok: true, size: f.metadata.size ?? null, note: 'fallback storage list' })
          initialTempFiles.push({
            name: f.name,
            size: f.metadata.size ?? null,
            b64,
            type: f.metadata.mimetype || null,
          })
        } catch(e:any){
          prefillDebug.attempts.push({ bucket, keyTried: key, ok: false, error: e?.message || String(e), note: 'fallback storage list' })
          prefillDebug.errors.push(`fallback download failed: ${key} — ${e?.message || e}`)
        }
        if (initialTempFiles.length >= 12) break
      }
      if (initialTempFiles.length) return initialTempFiles
    } catch(e: any){
      prefillDebug.attempts.push({ bucket, keyTried: prefix, ok: false, error: e?.message || String(e), note: 'list exception' })
    }
  }

  return initialTempFiles
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>,
  searchParams: Promise<SearchParams>
}) {
	const tFast = await getTranslations("worker.editor.fast");
  const { id } = await params
  const sp = await searchParams

  const { data: q, error: qErr } = await supabaseAdmin
    .from('questions')
    .select('id, title, description')
    .eq('id', id)
    .single()

  if (qErr || !q) {
    
    throw new Error(tFast("errors.notFound", { detail: qErr?.message || "" }))
  }

  const profileCfg = await loadPublishedProfileConfig(sp)

  const email = (typeof sp?.email === 'string' ? sp.email : Array.isArray(sp?.email) ? sp?.email?.[0] : '') || ''
     const adminList = (process.env.HIZLI_ADMIN_EMAILS || process.env.ADMIN_NOTIFY_EMAILS || "")
     .split(",")
     .map(s => s.trim())
     .filter(Boolean);
   const admins = adminList.length ? adminList : (MAIL.adminNotify ?? []).filter(Boolean);
   const ownerDomain = (OWNER.email || "").split("@")[1] || "";
  const isAdmin = admins.includes(email) || (!!ownerDomain && email.endsWith(`@${ownerDomain}`))

  const prefillDebug: PrefillDebug = { questionId: id, rowsFromDB: 0, listAttempts: [], attempts: [], errors: [] }
  const initialTempFiles = await tryDBThenStoragePrefill(id, prefillDebug)

  const initialQuestion = ((q.title || '') + (q.description ? ('\n\n' + q.description) : '')).trim()

  

  return (
    <HizliUretimCloneClient
      questionId={id}
      initialQuestion={initialQuestion}
      initialTempFiles={initialTempFiles}
      prefillDebug={prefillDebug}
      isAdmin={isAdmin}
      profileConfig={profileCfg}
      searchParams={Object.fromEntries(Object.entries(sp || {}).map(([k,v])=>[k, Array.isArray(v)?v.join(','): (v||'') ]))}
    />
  )
}
