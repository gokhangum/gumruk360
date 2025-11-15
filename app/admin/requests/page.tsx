import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import { isAdmin } from '@/lib/auth/requireAdmin'
import Actions from './Actions'
import Filters from './Filters'
import SlaBadge from './SlaBadge'
import { unstable_noStore as noStore } from 'next/cache'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type SearchParams = Record<string, any>

function safeStr(v: any) { return v == null ? '' : String(v) }
function pickAdminEmail(sp: SearchParams): string {
  const fromUrl = safeStr(sp.email).trim()
  if (fromUrl) return fromUrl
  const allow = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (allow.length) return allow[0]
  return process.env.ADMIN_EMAILS || ""
}
function isUuid(v: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) }
function sanitizeIlike(v: string) { return v.replace(/[(),]/g, ' ').trim() }
function pickOne(val: any): string { return Array.isArray(val) ? safeStr(val[0] ?? '') : safeStr(val ?? '') }
function norm(val: any) { return safeStr(val).trim() }

function normalizeStatus(raw: any): '' | 'submitted' | 'approved' | 'rejected' | 'paid' {
  const v = pickOne(raw).toLowerCase().trim()
  const allowed = new Set(['submitted','approved','rejected','paid'])

  return (allowed.has(v) ? (v as any) : '')
}
function normalizeAnswer(raw: any) {
  const v = pickOne(raw).toLowerCase().trim()
  const allowed = new Set(['drafting','in_review','completed','sent','reopened'])
  return (allowed.has(v) ? v : '')
}
function normalizeClaim(raw: any) {
  const v = pickOne(raw).toLowerCase().trim()
  const allowed = new Set(['none','pending','approved'])
  return (allowed.has(v) ? v : '')
}
function normalizeAssigned(raw: any): 'any' | 'me' | 'unassigned' | string {
  const vRaw = pickOne(raw).trim()
  const v = vRaw.toLowerCase().trim()
  if (v === 'me' || v === 'unassigned') return v
  // UUID ise olduğu gibi döndür
  if (/^[0-9a-fA-F-]{36}$/.test(vRaw)) return vRaw
  return 'any'
}
function normalizeUrgent(raw: any): '' | '1' | '0' {
  const v = pickOne(raw).trim()
  if (v === '1' || v === '0') return v
  return ''
}
function normalizeSort(raw: any): 'created_desc'|'created_asc'|'due_asc'|'due_desc' {
  const v = pickOne(raw).toLowerCase().trim()
  const allowed = new Set(['created_desc','created_asc','due_asc','due_desc'])
  return (allowed.has(v) ? (v as any) : 'created_desc')
}

/** dueAt = sla_due_at || (created_at + est_days_[urgent/normal]) */
function computeDueAtTs(r: any): number | null {
  if (r?.sla_due_at) {
    const t = new Date(r.sla_due_at as string).getTime()
    return Number.isFinite(t) ? t : null
  }
  if (!r?.created_at) return null
  const base = new Date(r.created_at as string).getTime()
  if (!Number.isFinite(base)) return null
  const days = (r?.is_urgent ? (r?.est_days_urgent ?? 1) : (r?.est_days_normal ?? 1)) ?? 1
  const ms = base + Number(days) * 86400000
  return Number.isFinite(ms) ? ms : null
}

export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  noStore()

  const sp = await searchParams

  // Admin kontrolü
  const adminEmail = pickAdminEmail(sp)
  if (!isAdmin(adminEmail)) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Yetkisiz</h1>
        <p className="text-sm text-gray-600">Lütfen admin girişi yapın.</p>
      </div>
    )
  }

  // URL -> filtreler
  const qRaw = norm(sp.s)
  const q = sanitizeIlike(qRaw)

  const rawStatus = (sp as any).st ?? (sp as any).status
  const status   = normalizeStatus(rawStatus)
  const answer   = normalizeAnswer((sp as any).answer)
  const claim    = normalizeClaim((sp as any).claim)
  const assigned = normalizeAssigned((sp as any).assigned)
  const urgent   = normalizeUrgent((sp as any).urgent)
  const sort     = normalizeSort((sp as any).sort)

  // "assigned=me" için user_id
  let meUserId: string | null = null
  if (assigned === 'me') {
    try {
      const u = await supabaseAdmin.schema('auth').from('users').select('id').eq('email', adminEmail).maybeSingle()
      meUserId = (u.data as any)?.id || null
    } catch { meUserId = null }
  }

  // DB sorgu
  let rb = supabaseAdmin
    .from('questions')
    .select('id, title, description, status, answer_status, claim_status, is_urgent, created_at, sla_due_at, est_days_normal, est_days_urgent, assigned_to, paid_at')

  if (status) rb = rb.eq('status', status)
  if (answer) rb = rb.eq('answer_status', answer)
  if (claim)  rb = rb.eq('claim_status',  claim)
  if (urgent === '1') rb = rb.eq('is_urgent', true)
  if (urgent === '0') rb = rb.eq('is_urgent', false)
  // Worker bazlı filtre (UUID)
  if (assigned && /^[0-9a-fA-F-]{36}$/.test(String(assigned))) { rb = rb.eq('assigned_to', String(assigned)) }
  
  // Worker bazlı filtre
  if (assigned && /^[0-9a-fA-F-]{36}$/.test(assigned)) { rb = rb.eq('assigned_to', assigned) }

  if (q) {
    const parts = [`title.ilike.%${q}%`, `description.ilike.%${q}%`]
    if (isUuid(q)) parts.unshift(`id.eq.${q}`)
    rb = rb.or(parts.join(','))
  }

  // created_* sıraları DB’de; due_* runtime’da
  if (sort === 'created_asc') rb = rb.order('created_at', { ascending: true })
  else rb = rb.order('created_at', { ascending: false })

  rb = rb.limit(1000)

  const { data: rows, error } = await rb
  if (error) {
    
    throw new Error(`DB error: ${error.message}`)
  }

  // Runtime filtre
  let list = (rows || []) as any[]

if (status)   list = list.filter(r => safeStr(r.status).toLowerCase().trim() === status)
  if (answer)   list = list.filter(r => safeStr(r.answer_status).toLowerCase().trim() === answer)
  if (claim)    list = list.filter(r => safeStr(r.claim_status).toLowerCase().trim() === claim)
  if (urgent==='1') list = list.filter(r => !!r.is_urgent)
  if (urgent==='0') list = list.filter(r => !r.is_urgent)
  if (assigned==='unassigned') list = list.filter(r => !r.assigned_to)
  if (assigned==='me' && meUserId) list = list.filter(r => safeStr(r.assigned_to) === safeStr(meUserId) || r.assigned_to == null)
  // Worker id seçilmişse client-side fallback
  if (assigned && /^[0-9a-fA-F-]{36}$/.test(String(assigned))) list = list.filter(r => safeStr(r.assigned_to) === safeStr(String(assigned)))

  // Runtime sıralama — Yaklaşan/Uzak SLA (null'lar sonda)
  if (sort === 'due_asc' || sort === 'due_desc') {
    const dueTs = (r: any) => computeDueAtTs(r)
    if (sort === 'due_asc') {
      list = [...list].sort((a, b) => {
        const da = dueTs(a), db = dueTs(b)
        if (da == null && db == null) return 0
        if (da == null) return 1
        if (db == null) return -1
        return da - db
      })
    } else {
      list = [...list].sort((a, b) => {
        const da = dueTs(a), db = dueTs(b)
        if (da == null && db == null) return 0
        if (da == null) return 1
        if (db == null) return -1
        return db - da
      })
    }
  }

  
// WORKER LİSTESİ — filtre için
let workers: { id: string, name: string }[] = []
try {
  const { data: wrows, error: werr } = await supabaseAdmin
    .from('worker_cv_profiles')
    .select('worker_user_id,display_name')
    .order('display_name', { ascending: true })
  if (!werr) {
    workers = (wrows || []).map((r: any) => ({
      id: String(r.worker_user_id || ''),
      name: String(r.display_name || '—')
    })).filter(w => w.id)
  }
} catch (e) {
  
}
// 'Bana atanmış' = workerlere atanMAmış (assigned_to worker listesinde DEĞİL)
if (assigned === 'me') {
  const workerIdSet = new Set((workers || []).map(w => String(w.id)))
  list = list.filter((r: any) => !workerIdSet.has(String(r.assigned_to ?? '')))
}


// ÖDEME BİLGİLERİ — kredi & normal
const qIds = Array.from(new Set(list.map(r => r.id))) as string[]
const payCredit: Record<string, number> = {}
const payMoney:  Record<string, number> = {}

if (qIds.length) {
  // 2a) Kredi: v_credit_by_question.total_change
  try {
    const { data: vcRows } = await supabaseAdmin
      .from('v_credit_by_question')
      .select('question_id,total_change')
      .in('question_id', qIds)
    for (const row of vcRows || []) {
      const qid = String((row as any).question_id || '')
      const v   = Number((row as any).total_change ?? 0)
      if (qid) payCredit[qid] = v
    }
  } catch {}

  // 2b) Normal ödeme: payments.amount_cents (TL için /100), son kaydı al
  try {
    const { data: pRows } = await supabaseAdmin
      .from('payments')
      .select('question_id,amount_cents,created_at')
      .in('question_id', qIds)
      .order('created_at', { ascending: false })
    for (const row of pRows || []) {
      const qid = String((row as any).question_id || '')
      const amt = Number((row as any).amount_cents ?? 0)
      if (qid && payMoney[qid] == null && amt > 0) {
            payMoney[qid] = amt / 100
          }
    }
  } catch {}
}

// Görüntülenecek ödeme label
const paymentLabel: Record<string, string> = {}
for (const it of list) {
  const id = String(it.id)
  if (payCredit[id] != null) paymentLabel[id] = String(payCredit[id])
  else if (payMoney[id] != null) paymentLabel[id] = String(payMoney[id])
}

  // ATANAN ETİKETLER — RLS’e takılmayan fonksiyonla full_name çek
  const ids = Array.from(new Set(list.map(r => r.assigned_to).filter(Boolean))) as string[]
  const assignedLabel: Record<string, string> = {}
  if (ids.length) {
    try {
      const { data: rows2, error: rpcErr } = await supabaseAdmin
        .rpc('admin_lookup_users', { in_ids: ids })
      if (rpcErr) console.error('admin_lookup_users RPC error:', rpcErr)
      for (const row of rows2 || []) {
        const id = safeStr((row as any).id)
        const name = safeStr((row as any).full_name)
        const email = safeStr((row as any).email)
        if (id) {
          if (name) assignedLabel[id] = name         // 1) full_name
          else if (email) assignedLabel[id] = email  // 2) email (yedek)
        }
      }
    } catch (e) {
      
    }
  }

  // UI
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-semibold">Admin – Requests</h1>
        
      </div>

      {/* Aktif filtre rozetleri */}
      <div className="mb-2 text-xs text-gray-600 flex flex-wrap gap-2">
        {status   ? <span className="px-2 py-0.5 rounded bg-gray-100">status={status}</span> : null}
        {answer   ? <span className="px-2 py-0.5 rounded bg-gray-100">answer={answer}</span> : null}
        {claim    ? <span className="px-2 py-0.5 rounded bg-gray-100">claim={claim}</span> : null}
        {assigned !== 'any' ? <span className="px-2 py-0.5 rounded bg-gray-100">assigned={assigned}</span> : null}
        {urgent   ? <span className="px-2 py-0.5 rounded bg-gray-100">urgent={urgent}</span> : null}
        {/* sort rozetini kaldırdık */}
      </div>
<Filters adminEmail={adminEmail} workers={workers} />

      <div className="mt-3 border rounded overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">Başlık</th>
              <th className="text-left px-3 py-2">Durumlar</th>
              <th className="text-left px-3 py-2">Ödeme</th>
              <th className="text-left px-3 py-2">SLA</th>
              <th className="text-left px-3 py-2">Atanan</th>
              <th className="text-left px-3 py-2">Oluşturma</th>
              <th className="text-left px-3 py-2">Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r: any) => {
              const key = safeStr(r.assigned_to)
              const label = assignedLabel[key] || (key ? `${key.slice(0,8)}…` : '—')
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 align-top font-mono">
                    <Link
                       href={`/admin/request/${r.id}?email=${encodeURIComponent(adminEmail)}`}
                       className="underline hover:no-underline font-mono"
                     >
                       {r.id}
                     </Link>
                  </td>
                  <td className="px-3 py-2 align-top max-w-[420px]">
                    <div className="font-medium">{safeStr(r.title) || '—'}</div>
                    {r.description ? <div className="text-xs text-gray-600 max-h-10 overflow-hidden text-ellipsis">{safeStr(r.description)}</div> : null}
                    {r.is_urgent ? <span className="inline-block mt-1 text-[10px] bg-red-50 text-red-700 rounded px-1.5 py-0.5">ACİL</span> : null}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="text-xs">status: <b>{safeStr(r.status) || '-'}</b></div>
                    <div className="text-xs">answer: <b>{safeStr(r.answer_status) || '-'}</b></div>
                    <div className="text-xs">claim: <b>{safeStr(r.claim_status) || '-'}</b></div>
                  </td>
                  
<td className="px-3 py-2 align-top">
  <div className="text-xs">{paymentLabel[r.id] || ''}</div>
</td>
<td className="px-3 py-2 align-top">
                    <SlaBadge
                      createdAt={r.created_at}
                      slaDueAt={r.sla_due_at}
                      isUrgent={!!r.is_urgent}
                      estDaysNormal={Number(r.est_days_normal ?? 1)}
                      estDaysUrgent={Number(r.est_days_urgent ?? 1)}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="text-xs">{label}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="text-xs font-mono">{r.created_at ? new Date(r.created_at).toLocaleString('tr-TR') : '-'}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Actions id={r.id} adminEmail={adminEmail} />
                  </td>
                </tr>
              )
            })}
            {list.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-sm text-gray-500" colSpan={8}>Kayıt bulunamadı.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
