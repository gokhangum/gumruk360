import Link from "next/link"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import SlaBox from "@/components/SlaBox"
import AskOfferActions from "./AskOfferActions"
import DownloadPdfButton from "./DownloadPdfButton"
import BuyCreditsIfZero from "./BuyCreditsIfZero"
import { headers } from "next/headers"
import { APP_DOMAINS } from "@/lib/config/appEnv"
import { getTranslations } from "next-intl/server"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function s(v: any) { return v == null ? "": String(v) }

export default async function AskOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
const h = await headers()
const host = h.get("x-forwarded-host") || h.get("host") || ""
const locale: 'tr'|'en' = APP_DOMAINS.en ? (host.endsWith(APP_DOMAINS.en) ? 'en' : 'tr') : 'tr'
const nfLocale = locale === 'tr' ? 'tr-TR' : 'en-US'
const t = await getTranslations({ locale, namespace: 'offer' })

  // Soru verisi
  const { data: q, error } = await supabaseAdmin
    .from("questions")
    .select([
      "id",
      "user_id",
      "org_id",
      "title",
      "description",
      "status",
      "created_at",
      "is_urgent",
      "est_days_normal",
      "est_days_urgent",
      "price_tl",
      "price_final_tl",
      "currency",
      "sla_due_at",
      "pricing",
      "assigned_to"].join(","))
    .eq("id", id)
    .maybeSingle()

  if (error || !q) {
    return (
      <div className="max-w-none md:max-w-3xl mx-auto p-6">
        <h1 className="text-lg font-semibold">{t("notFound.title")}</h1>
        <p className="text-sm text-gray-600">{t("notFound.questionId")}: <span className="font-mono">{id}</span></p>
        <Link href="/ask" className="underline text-sm mt-3 inline-block">{t("notFound.backToAsk")}</Link>
      </div>
    )
  }

  // === Kullanıcının account_type'ını auth.users -> user_metadata.account_type'tan al ===
  let accountType: string | undefined = undefined
  try {
    const userId = (q as any).user_id as string
    if (userId) {
      const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(userId)
      const um = (userRes as any)?.user?.user_metadata || (userRes as any)?.user?.raw_user_meta_data || {}
      accountType = typeof um?.account_type === "string" ? um.account_type : undefined
    }
  } catch {}

  // Kurumsal üyelik kontrolü (owner/admin/member aktif)
  let isCorporateByMembership = false
  try {
    const { data: orgRows } = await supabaseAdmin
      .from("organization_members")
      .select("org_id, org_role")
      .eq("user_id", (q as any).user_id)
      .eq("status", "active")
      .limit(1)
    isCorporateByMembership = !!(orgRows && orgRows.length)
  } catch {}

  /**
   * Nihai kurumsal bayrak:
   * - Auth metadata: account_type === "corporate"  → kurumsal
   * - VEYA organization_members'ta aktif üyelik  → kurumsal
   */
  const isCorporate = (accountType === "corporate") || isCorporateByMembership

  // Son sipariş (varsa)
  const { data: ord } = await supabaseAdmin
    .from("orders")
    .select("id, status")
    .eq("question_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const price = Number((q as any).price_final_tl ?? (q as any).price_tl ?? 0)
  const canAccept = Number.isFinite(price) && price > 0
    // ---- Kullanıcı tenant'ına göre para birimi ve gösterilecek fiyat ----
  const resolved = await (await import("@/lib/fx/resolveTenantCurrency")).resolveTenantCurrency({
    userId: (q as any).user_id,
    host
  });
  const displayCurrency = (resolved?.currency ?? "TRY").toUpperCase();
  const pricingMultiplier = Number(resolved?.pricing_multiplier ?? 1);

  let displayAmount = price; // varsayılan TRY
  if (displayCurrency !== "TRY") {
    const { fxBaseTry, computeLockedFromTRY } = await import("@/lib/fx/resolveTenantCurrency");
    const { rate } = await fxBaseTry(displayCurrency);
    if (Number.isFinite(rate) && rate > 0) {
      displayAmount = computeLockedFromTRY({
        tryAmount: price,
        baseCurrency: displayCurrency,
        fxRateBaseTry: rate,
        multiplier: pricingMultiplier
      });
    }
  }
  // ---- /para birimi ----

  const pendingOrderId = ord && (ord.status === "pending" || ord.status === "awaiting_payment") ? ord.id : null

  // ---- Kredi hesapları ----
  const { data: ss } = await supabaseAdmin
    .from("subscription_settings")
    .select("credit_price_lira, credit_discount_user, credit_discount_org")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const creditPrice = Number(ss?.credit_price_lira ?? 1)
  const rawDiscount = isCorporate ? Number(ss?.credit_discount_org ?? 0) : Number(ss?.credit_discount_user ?? 0)
  const discount = rawDiscount > 1 ? (rawDiscount / 100) : rawDiscount

  const baseForCredit = price * (1 - discount)
  const creditAmount = baseForCredit / (creditPrice || 1)

  // Yüzde etiketi: 0.1 -> %10, 20 -> %20
  const pctVal = rawDiscount > 1 ? rawDiscount : (rawDiscount * 100)
  const pctStr = Number.isInteger(pctVal) ? String(pctVal) : pctVal.toLocaleString(nfLocale, { maximumFractionDigits: 2 })
  const creditAmountText = t("creditLine", { amount: creditAmount, pct: pctStr })
  // ---- /Kredi hesapları ----
  const creditAmountDisplay = Math.round(creditAmount * pricingMultiplier)
  const creditAmountTextDisplay = t("creditLine", { amount: creditAmountDisplay, pct: pctStr })
// Seçilen danışman ad-soyadını çek (assigned_to -> worker_cv_profiles.display_name)
let consultantName: string | undefined = undefined
try {
  const assignedTo = (q as any).assigned_to as string | null
  if (assignedTo) {
    const { data: w } = await supabaseAdmin
      .from("worker_cv_profiles")
      .select("display_name")
      .eq("worker_user_id", assignedTo)
      .maybeSingle()
    consultantName = (w as any)?.display_name || undefined
  }
} catch {}


  return (
   
   <div className="px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
      <div className="card-surface shadow-colored rounded-none md:rounded-xl">
      <div className="px-5 py-4 border-b border-slate-100">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <DownloadPdfButton questionId={(q as any).id} />
      </div>
  </div>
      <div className="p-5 space-y-5">
      {/* Soru özeti – yalnızca Oluşturma */}
      <div className="card-surface p-4 space-y-2">
        <div className="text-xs text-gray-500">
          {(q as any).created_at ? (
            <>{t("createdAt")}: <span className="font-mono">{new Date((q as any).created_at).toLocaleString(nfLocale)}</span></>
          ) : null}
        </div>
        <div className="font-medium">{s((q as any).title) || "—"}</div>
        {(q as any).description ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{s((q as any).description)}</p>
        ) : null}
      </div>

      {/* SLA & Fiyat hesap özeti — Ücret ve altında Kredi Tutarı HER ZAMAN görünür */}
      <SlaBox
        pricing={(q as any).pricing || null}
        isUrgent={!!(q as any).is_urgent}
        heading={t("title")}
        showCalc={false}
        creditBelowPriceText={creditAmountTextDisplay}
		  displayAmount={displayAmount}
        displayCurrency={displayCurrency}
        consultantName={consultantName}
      />

      {/* Kredi Tutarı satırının hemen altı:
          - Sadece bireysel kullanıcılarda, bakiye=0 ise gösterilsin.
          - Kurumsal ise asla gösterilmesin. */}
      {!isCorporate && (
        <div className="-mt-1">
          <BuyCreditsIfZero questionId={(q as any).id} />
        </div>
      )}

      {/* İşlemler */}
     <div className="card-surface p-4 space-y-2">
        <AskOfferActions
          questionId={(q as any).id}
          status={s((q as any).status)}
          canAccept={canAccept}
          pendingOrderId={pendingOrderId}
          isCorporate={isCorporate}
        />
      </div>
    </div>
	      </div>  
    </div>    
     
   
  )
}
