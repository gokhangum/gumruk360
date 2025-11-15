// app/admin/request/[id]/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '../../../../lib/supabase/serverAdmin'
import { isAdmin } from '../../../../lib/auth/requireAdmin'
import Actions from '../../requests/Actions'
import EditorPanel from './EditorPanel'
import RequestAttachments from './RequestAttachments'
import L2InfoSectionServer from "@/app/(dashboard)/ask/[id]/L2InfoSectionServer";
import { headers } from 'next/headers'

function detectDomain(h: Headers) {
  const host = h.get('x-forwarded-host') || h.get('host') || ''
  return (host || '').split(':')[0]
}

async function getL2Strictness(domain: string, locale: 'tr'|'en') {
  const { data } = await supabaseAdmin
    .from('gpt_precheck_settings')
    .select('l2_strictness')
    .eq('domain', domain)
    .eq('locale', locale)
    .maybeSingle()
  const raw = data?.l2_strictness
  return (typeof raw === 'number') ? Math.max(0, Math.min(3, Math.floor(raw))) : 1
}

/** strictness=0 ise hiç göstermeyen sarmalayıcı */
async function L2InfoMaybe({ id }: { id: string }) {
  const h = await headers()
  const domain = detectDomain(h)
     const locale: 'tr' | 'en' = /(^|\.)tr\.easycustoms360\.com$/i.test(domain) ? 'en' : 'tr'
  const strict = await getL2Strictness(domain, locale)
  if (strict === 0) return null
  return <L2InfoSectionServer id={id} locale={locale} />
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Params = { id: string }


 const first = <T,>(arr?: T[] | null) =>
   (Array.isArray(arr) && arr.length > 0 ? arr[0] : null)

 type SearchParams = Record<string, string | string[] | undefined>

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const { id } = await params
  const sp = await searchParams
  const adminEmail = (sp?.email || '').toString()

  // Soru
  const { data: q, error: qErr } = await supabaseAdmin
    .from('questions')
    .select(
      [
        'id',
        'title',
        'description',
        'status',
        'answer_status',
        'claim_status',
        'assigned_to',
        'paid_at',
        'created_at',
        'user_id',
      ].join(', ')
    )
    .eq('id', id)
    .single()

  if (qErr || !q) {
    throw new Error(`Question not found: ${qErr?.message || ''}`)
  }

  // Editör initial: son taslak → revizyon fallback
  let initialContent = ''
  let latestVersion = 0

  try {
    const { data: lastDraft } = await supabaseAdmin
      .from('answer_drafts')
      .select('id, version, content, model, created_at, created_by')
      .eq('question_id', id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastDraft?.content) {
      initialContent = String(lastDraft.content)
      latestVersion = Number(lastDraft.version || 0)
    }
  } catch {}

  if (!initialContent) {
    try {
      const byNo = await supabaseAdmin
        .from('revisions')
        .select('id, content, revision_no, created_at')
        .eq('question_id', id)
        .order('revision_no', { ascending: false })
        .limit(1)
      const rev = first(byNo.data)
      if (rev?.content) initialContent = String((rev as any).content)
    } catch {}

    if (!initialContent) {
      try {
        const byVer = await supabaseAdmin
          .from('revisions')
          .select('id, content, version, created_at')
          .eq('question_id', id)
          .order('version', { ascending: false })
          .limit(1)
        const rev = first(byVer.data)
        if (rev?.content) initialContent = String((rev as any).content)
      } catch {}
    }

    if (!initialContent) {
      try {
        const byTime = await supabaseAdmin
          .from('revisions')
          .select('id, content, created_at')
          .eq('question_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
        const rev = first(byTime.data)
        if (rev?.content) initialContent = String((rev as any).content)
      } catch {}
    }
  }

  return (
    <main className="p-6 space-y-4">
      {/* Üst başlık + listeye dönüş */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Request Detail</h1>
        <Link
          className="underline"
          href={`/admin/requests?email=${encodeURIComponent(adminEmail)}`}
        >
          ← Listeye Dön
        </Link>
      </div>

      {/* Özet kutusu */}
      <section className="border rounded p-4 space-y-1">
       <div className="text-sm text-gray-500">
        ID: <span className="font-mono">{(q as any).id}</span>
      </div>
      <div className="text-lg font-medium">{(q as any).title || '—'}</div>

       {(q as any).description && (
         <p className="text-sm whitespace-pre-wrap">{(q as any).description}</p>
       )}

        <div className="text-sm flex gap-4 mt-2">
         <span> Status: <b>{(q as any).status || '-'}</b> </span>
          <span> Answer: <b>{(q as any).answer_status || '-'}</b> </span>
          <span> Claim: <b>{(q as any).claim_status || '-'}</b> </span>
         <span> Paid At: <b className="font-mono">{(q as any).paid_at || '-'}</b> </span>
        </div>
      </section>

      {/* Soru ekleri */}
      <div className="attachments-grid"><RequestAttachments questionId={(q as any).id} /></div>
<style>{`
  .attachments-grid ul, .attachments-grid .list, .attachments-grid .items { display: flex; flex-wrap: wrap; gap: 12px; }
  .attachments-grid li, .attachments-grid .item { flex: 0 1 280px; min-width: 220px; }
  .attachments-grid a { display: inline-flex; max-width: 100%; }
`}</style>
<L2InfoMaybe id={id} />

      {/* Editör paneli */}
      <EditorPanel
        questionId={(q as any).id}
        adminEmail={adminEmail}
       title={(q as any).title ?? ''}
        description={(q as any).description ?? ''}

        initialContent={initialContent}
        latestVersion={latestVersion}
      />

      {/* Diğer aksiyonlar */}
      <section className="border rounded p-4">
        <h2 className="font-semibold mb-3">Aksiyonlar</h2>
       <Actions id={(q as any).id} adminEmail={adminEmail} />
      </section>
    </main>
  )
}
