import { headers, cookies } from "next/headers"
import L2InfoSectionServer from '../L2InfoSectionServer'
import { supabaseServer } from "../../../../../lib/supabase/server"
import Link from "next/link"
import TermsClient from "./TermsClient"
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import { getTranslations } from "next-intl/server"
import { APP_DOMAINS } from "../../../../../lib/config/appEnv";
import { resolveTenantCurrency } from "../../../../../lib/fx/resolveTenantCurrency"
function detectDomain(h: Headers) {
  const host = h.get('x-forwarded-host') || h.get('host') || ''
  return (host || '').split(':')[0] || APP_DOMAINS.primary
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
     const locale: 'tr'|'en' =
     (APP_DOMAINS.en && domain.endsWith(APP_DOMAINS.en)) ? 'en' : 'tr'
  const strict = await getL2Strictness(domain, locale)
  if (strict === 0) return null
  return <L2InfoSectionServer id={id} locale={locale} />
}


export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export default async function TermsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await supabaseServer()

  const h = await headers()
  const proto = h.get("x-forwarded-proto") ?? "http"
  const host  = h.get("x-forwarded-host") ?? h.get("host")
  const origin = `${proto}://${host}`
  const domain = detectDomain(h as any)
     const locale: 'tr'|'en' =
    (APP_DOMAINS.en && domain.endsWith(APP_DOMAINS.en)) ? 'en' : 'tr'
  const nfLocale = locale === 'tr' ? 'tr-TR' : 'en-US'
  const t = await getTranslations({ locale, namespace: 'terms' })

  const ck = await cookies()
  const cookieHeader = ck.getAll().map(c => `${c.name}=${c.value}`).join("; ")

  const res = await fetch(`${origin}/api/ask/${id}/credit-options`, {
    cache: "no-store",
    headers: { cookie: cookieHeader },
  })
  const credit = await res.json().catch(() => ({} as any))

  const { data: q } = await supabase
    .from("questions")
    .select("id, user_id, price_final_tl, price_tl, price_final_usd")
    .eq("id", id)
    .maybeSingle()

  const price = Number((q as any)?.price_final_tl ?? (q as any)?.price_tl ?? 0)
// Görüntülenecek para birimi (tenant/user + host'a göre) ve tutar
const resolved = await resolveTenantCurrency({
  userId: (q as any)?.user_id ?? null,
  host
})
const displayCurrency = (resolved?.currency ?? "TRY").toUpperCase()
// const pricingMultiplier = Number(resolved?.pricing_multiplier ?? 1)

  // Varsayılan TRY fiyat
  let displayAmount = price
  const usdLocked = Number((q as any)?.price_final_usd ?? 0)

  // USD için FX hesaplama YAPMA; DB’de kilitlenmiş USD değeri kullan
  if (displayCurrency === "USD") {
    displayAmount = usdLocked
  }


  let required = Number(credit?.requiredUserCredits ?? credit?.requiredCredits ?? 0)
  let balance  = Number(credit?.userBalance ?? credit?.balance ?? 0)

  if (!Number.isFinite(balance)) {
    try {
      const b = await fetch(`${origin}/api/dashboard/balance`, {
        cache: "no-store",
        headers: { cookie: cookieHeader },
      })
      const bj = await b.json()
      balance = Number(bj?.user_balance ?? bj?.balance ?? 0)
    } catch {
      balance = 0
    }
  }

  return (
   
      <div className="px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
        <div className="card-surface shadow-colored rounded-none md:rounded-xl">

      <div className="card-surface p-4 space-y-2 edge-underline edge-blue edge-taper edge-rise-2mm">
	  <h1 className="text-xl font-semibold">{t("title")}</h1>
        <div className="text-sm text-gray-600">{t("labels.questionId")}</div>
        <div className="font-medium break-all">{id}</div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-sm text-gray-600">{t("labels.priceTL")}</div>
            <div className="font-medium">
             {new Intl.NumberFormat(nfLocale, { maximumFractionDigits: 0 }).format(displayAmount)} {displayCurrency}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">{t("labels.requiredCredits")}</div>
            <div className="font-medium">{required}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">{t("labels.balance")}</div>
            <div className="font-medium">
              {new Intl.NumberFormat(nfLocale, { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(balance)}
            </div>
          </div>
        </div>
      </div>

      {/* L2 Info under question & fees */}
     <L2InfoMaybe id={id} />

      <div className="card-surface p-4 space-y-2 edge-underline edge-blue edge-taper edge-rise-2mm">
	  {/* Sağ üstte ödeme altyapısı bilgisi + logo (diğer içeriği itmesin diye absolute) */}
        <div className="absolute right-4 top-4 flex items-start justify-end">
          {displayCurrency === "TRY" ? (
            <div className="inline-flex flex-col items-end gap-1 text-[11px] leading-snug text-slate-900">
              <span>{t("sections.info.paytr")}</span>
              <img
                src="/pay/paytrlogo.png"
                alt="PayTR"
                className="h-6 md:h-7 w-auto"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="inline-flex flex-col items-end gap-1 text-[11px] leading-snug text-slate-900">
              <span>{t("sections.info.paddle")}</span>
              <img
                src="/pay/paytrlogo.png"
                alt="Paddle"
                className="h-6 md:h-7 w-auto"
                loading="lazy"
              />
            </div>
          )}
        </div>
      <div className="prose prose-sm max-w-none mt-16 md:mt-0">
         <h2>{t("sections.info.title")}</h2>

        <ul>
          <li>{t("sections.info.li1")}</li>
         <li>{t("sections.info.li2")}</li>
         <li>{t("sections.info.li3")}</li>
          <li>{t("sections.info.li4")}</li>
           <li>{t("sections.info.li5")}</li>
          <li>{t("sections.info.li6")}</li>
         <li>{t("sections.info.li7")}</li>
          <li>{t("sections.info.li8")}</li>
         </ul>
       </div>

      {/* Onay/ilerleme ve Vazgeç */}
     {/* Onay/ilerleme ve Vazgeç */}
<div className="mt-4">
  <TermsClient questionId={id} displayCurrency={displayCurrency}>
    <Link
      href={`/ask/${id}`}
      className="btn btn--outline text-sm h-10 px-4 w-full md:w-auto"
      title={t("actions.cancel")}
    >
      {t("actions.cancel")}
    </Link>
  </TermsClient>
</div>


      </div>
    </div>
	</div>
  )
}
