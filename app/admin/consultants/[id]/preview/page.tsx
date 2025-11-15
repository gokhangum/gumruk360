export const dynamic = 'force-dynamic'

import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import CvPreviewCard from "@/components/cv/CvPreviewCard"
import Link from "next/link"

type Params = Promise<{ id: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function Page({ params, searchParams }: { params: Params, searchParams?: SearchParams }) {
  const { id } = await params
  const sp = (await searchParams) || {}
  const langParam = typeof sp.lang === "string" ? sp.lang : Array.isArray(sp.lang) ? sp.lang[0] : undefined
  const locale: "tr" | "en" = langParam === "en" ? "en" : "tr"

  const supa = supabaseAdmin

  const { data: profile } = await supa
    .from('worker_cv_profiles')
    .select('display_name, title_tr, title_en, hourly_rate_tl, languages, tags, slug, photo_object_path')
    .eq('worker_user_id', id)
    .maybeSingle()

  let photoUrl: string | null = null
  if (profile?.photo_object_path) {
    const { data: signed } = await supa.storage
      .from('workers-cv')
      .createSignedUrl(profile.photo_object_path.replace(/^workers-cv\//, ''), 60 * 10)
    photoUrl = signed?.signedUrl || null
  } else {
    const path = `workers-cv/${id}/profile.jpg`
    const { data: signed } = await supa.storage.from('workers-cv').createSignedUrl(path.replace(/^workers-cv\//,''), 60*10)
    photoUrl = signed?.signedUrl || null
  }

  const { data: blocks } = await supa
    .from('worker_cv_blocks')
    .select('id, block_type, body_rich, order_no, is_visible, lang')
    .eq('worker_user_id', id)
    .eq('is_visible', true)
    .eq('lang', locale)
    .order('order_no', { ascending: true })

  const { data: types } = await supa
    .from('cv_block_types')
    .select('key, title_tr, title_en')
    .eq('is_active', true)

  const map = new Map<string, string>()
  for (const t of types || []) {
    map.set(t.key, locale === "tr" ? (t.title_tr || t.key) : (t.title_en || t.key))
  }

  const localizedBlocks = (blocks || []).map(b => ({
    ...b,
    block_type: map.get(String(b.block_type)) ?? String(b.block_type),
  }))
const title = locale === "en" ? (profile?.title_en ?? null) : (profile?.title_tr ?? null);
  return (
    <div className="p-4">
      {/* Language toggle (no client component needed) */}
      <div className="mb-4 flex items-center gap-2">
        <Link
          href={`/admin/consultants/${id}/preview?lang=tr`}
          className={`px-3 py-1.5 rounded border ${locale === "tr" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white"}`}
        >
          TR Önizleme
        </Link>
        <Link
          href={`/admin/consultants/${id}/preview?lang=en`}
          className={`px-3 py-1.5 rounded border ${locale === "en" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white"}`}
        >
          ENG Preview
        </Link>
      </div>


     <CvPreviewCard
  photoUrl={photoUrl}
  displayName={profile?.display_name || null}
  title={title}
        hourlyRate={profile?.hourly_rate_tl as any}
        languages={profile?.languages || []}
        tags={profile?.tags || []}
        blocks={localizedBlocks as any}
        locale={locale}
        showHourlyRate={false}
      />

      <div className="mt-8 flex justify-end">
        <Link
          href={`/admin/consultants/${id}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-300 hover:bg-neutral-50 transition text-sm"
        >
          <span aria-hidden>←</span>
          <span>Düzenlemeye geri dön</span>
        </Link>
      </div>
    </div>
  )
}
