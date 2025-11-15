import { headers, cookies } from "next/headers";
import Link from "next/link";
import L2InfoSectionServer from '../L2InfoSectionServer'
import { supabaseServer } from "../../../../../lib/supabase/server";
import ConfirmPay from "../ConfirmPay";
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import {getTranslations, getLocale} from "next-intl/server"
import { APP_DOMAINS } from "../../../../../lib/config/appEnv";
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

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("ask.confirmOrg")
const locale = await getLocale()
const nf2 = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) // fiyat
const nf0 = new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) // kredi/bakiye

  const supabase = await supabaseServer();

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const xh  = h.get("x-forwarded-host") ?? h.get("host");
  const origin = `${proto}://${xh}`;

  // Forward cookies for auth
  const ck = await cookies();
  const cookieHeader = ck.getAll().map(c => `${c.name}=${c.value}`).join("; ");

  // Offer + credit info
  const res = await fetch(`${origin}/api/ask/${id}/credit-options`, {
    cache: "no-store",
    headers: { cookie: cookieHeader },
  });
  const credit = await res.json();

  // Soru bilgisi
  const { data: q } = await supabase
    .from("questions")
    .select("id, title, price_final_tl, price_tl, user_id")
    .eq("id", id)
    .maybeSingle();

  const price = Number((q as any)?.price_final_tl ?? (q as any)?.price_tl ?? 0);
  // ---- Para birimi: tenants.currency'ye göre USD/TRY hesapla ----
  const host = detectDomain(h);
  const userId = (q as any)?.user_id as string | null;

  let displayCurrency = "TRY";
  let pricingMultiplier = 1;
  let displayAmount = price; // varsayılan TRY

  if (userId) {
    const { resolveTenantCurrency, fxBaseTry, computeLockedFromTRY } =
      await import("@/lib/fx/resolveTenantCurrency");

    const resolved = await resolveTenantCurrency({ userId, host });
    displayCurrency = (resolved?.currency ?? "TRY").toUpperCase();
    pricingMultiplier = Number(resolved?.pricing_multiplier ?? 1);

    if (displayCurrency !== "TRY") {
      const { rate } = await fxBaseTry(displayCurrency);
      if (Number.isFinite(rate) && rate > 0) {
        displayAmount = computeLockedFromTRY({
          tryAmount: price,
          baseCurrency: displayCurrency,
          fxRateBaseTry: rate,
          multiplier: pricingMultiplier,
        });
      }
    }
  }
  const priceLabel =
    (locale as string).startsWith("tr")
      ? `Ücret (${displayCurrency})`
      : `Fee (${displayCurrency})`;
  // ---- /para birimi ----

  const required = credit?.requiredOrgCredits ?? 0;
  const balance  = credit?.orgBalance ?? 0;

  return (
      <div className="px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
	

        <div className="card-surface shadow-colored rounded-none md:rounded-xl">
      <div className="card-surface p-4 space-y-2 edge-underline edge-blue edge-taper edge-rise-2mm">
	   <h1 className="text-lg font-semibold tracking-tight">{t("title")}</h1>
        <div className="text-sm text-gray-600">{t("questionId")}</div>
        <div className="font-medium">{id}</div>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <div className="text-sm text-gray-600">{priceLabel}</div>
            <div className="font-medium">{nf2.format(displayAmount)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">{t("requiredCredits")}</div>
            <div className="font-medium">{nf0.format(required)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">{t("balance")}</div>
            <div className="font-medium">{nf0.format(balance)}</div>
          </div>
        </div>

 <div className="mt-4">
 <L2InfoMaybe id={id} />
 </div>
       {/* Bilgilendirme (docx) */}
       <div className="mt-4 prose prose-sm max-w-none">
           <h2 className="!mt-0">{t("sections.info.title")}</h2>
        <ul>
           <li>{t("sections.info.li1")}</li>
             <li>{t("sections.info.li2")}</li>
             <li>{t("sections.info.li3")}</li>
             <li>{t("sections.info.li4")}</li>
            <li>{t("sections.info.li5")}</li>
            <li>{t("sections.info.li6")}</li>
            <li>{t("sections.info.li7")}</li>
           <li>
              {t("sections.info.li8")}{" "}
              <Link href="/dashboard/terms" className="underline underline-offset-2">
               Terms of Service
              </Link>
            </li>
          </ul>
        </div>


 <div className="mt-4">
 <ConfirmPay questionId={id} mode="org" />
 </div>
    </div>
	 </div>
	  </div>
	
  );
}
