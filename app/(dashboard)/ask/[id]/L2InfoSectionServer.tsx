import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import { getTranslations } from "next-intl/server"
import { APP_DOMAINS } from "@/lib/config/appEnv";
type L2Item = { key: string; label_tr?: string; label_en?: string; reason_tr?: string; reason_en?: string; source?: string }

function detectDomain(h: Headers) {
  const host = h.get('x-forwarded-host') || h.get('host') || ''
  return (host || '').split(':')[0] || APP_DOMAINS.primary
}

function choose<T>(tr: T|undefined, en: T|undefined, locale: 'tr'|'en') {
  return (locale === 'en' ? (en ?? tr) : (tr ?? en)) ?? ('' as any)
}

export default async function L2InfoSectionServer({ id, locale='tr' }: { id: string; locale?: 'tr'|'en' }) {
  const h = await headers()
  const domain = detectDomain(h)
  const loc = (locale || ((APP_DOMAINS.en && domain.endsWith(APP_DOMAINS.en)) ? 'en' : 'tr')) as 'tr'|'en'
const t = await getTranslations({ locale: loc, namespace: "l2info" })
  // Read question
  const { data: q } = await supabaseAdmin
    .from('questions')
    .select('precheck_result')
    .eq('id', id)
    .maybeSingle()

  const l2 = q?.precheck_result?.level2
  // Normalize shapes
  const missing = l2?.result?.missing || l2?.missing || l2?.result?.groups || l2?.result?.items || { required: [], should: [], info: [] }
  const required: L2Item[] = Array.isArray(missing?.required) ? missing.required : []
  const should: L2Item[]   = Array.isArray(missing?.should) ? missing.should : []
  const info: L2Item[]     = Array.isArray(missing?.info) ? missing.info : []

  // Read visibility settings (optional)
  let show = { required: true, should: true, info: true }
  try {
   const { data: s } = await supabaseAdmin
      .from('gpt_precheck_settings')
       .select('l2_visible_groups')
      .eq('domain', domain)
      .eq('locale', loc)
      .maybeSingle()
    if (s?.l2_visible_groups) {
   const vg = s.l2_visible_groups as any
    show = {
       required: vg.required ?? true,
        should:   vg.should   ?? true,
       info:     vg.info     ?? true,
      }
    }
   } catch {}

  const hasAny = (show.required && required.length>0) || (show.should && should.length>0) || (show.info && info.length>0)

  return (
    <div className="mt-6 border rounded-xl p-4 bg-gray-50">
      <div className="font-semibold mb-3">{t("title")}</div>
 <div className="text-sm">{t("intro")}</div>
      {!l2 ? (
        <div className="text-sm text-gray-600">{t("notReady")}</div>
      ) : !hasAny ? (
        <div className="text-sm text-gray-600">{t("none")}</div>
      ) : (
        <div className="space-y-4">
          {show.required && required.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t("groups.required")}</h4>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {required.map((it) => (
                  <li key={it.key}>
                    <span className="font-medium">{choose(it.label_tr, it.label_en, loc) || it.key}</span>
                    {choose(it.reason_tr, it.reason_en, loc) ? <span className="opacity-80"> — {choose(it.reason_tr, it.reason_en, loc)}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {show.should && should.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t("groups.should")}</h4>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {should.map((it) => (
                  <li key={it.key}>
                    <span className="font-medium">{choose(it.label_tr, it.label_en, loc) || it.key}</span>
                    {choose(it.reason_tr, it.reason_en, loc) ? <span className="opacity-80"> — {choose(it.reason_tr, it.reason_en, loc)}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {show.info && info.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t("groups.info")}</h4>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {info.map((it) => (
                  <li key={it.key}>
                    <span className="font-medium">{choose(it.label_tr, it.label_en, loc) || it.key}</span>
                    {choose(it.reason_tr, it.reason_en, loc) ? <span className="opacity-80"> — {choose(it.reason_tr, it.reason_en, loc)}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
