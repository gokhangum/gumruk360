// components/SlaBox.tsx
'use client'
import {useTranslations, useLocale} from "next-intl"
type Pricing = {
  estHours?: number
  estDaysNormal?: number
  estDaysUrgent?: number
  baseHourly?: number
  minFee?: number
  priceRaw?: number
  priceFinal?: number
  firstTimeMultiplier?: number
  urgentMultiplier?: number
  slaDueAt?: string
  calcMode?: string
  credit?: number | string
}

function splitHoursToHM(h?: number | null) {
  const v = Number(h) || 0
  const hours = Math.floor(v)
  const minutes = Math.round((v - hours) * 60)
  return { h: hours, m: minutes }
}

function splitDaysToDH(d?: number | null) {
  const v = Number(d) || 0
  const days = Math.floor(v)
  const hours = Math.round((v - days) * 24)
  return { d: days, h: hours }
}

export default function SlaBox({
  pricing,
  isUrgent,
  heading,
  showCalc = false,
  creditOnly = false,
  creditText,
  creditBelowPriceText,
  consultantName,
    displayAmount,
  displayCurrency,
}: {
  pricing: Pricing | null
  isUrgent?: boolean
  heading?: string
  showCalc?: boolean
  creditOnly?: boolean
  creditText?: string
  creditBelowPriceText?: string
  consultantName?: string
    displayAmount?: number
  displayCurrency?: string
}) {
	const t = useTranslations('slaBox')
	const locale = useLocale()
  if (!pricing) {
    return (
      <div className="border rounded-xl p-4">
        <h2 className="font-semibold mb-2">{heading ?? t('heading')}</h2>
        <p className="text-sm text-gray-600">{t('notFound')}</p>
      </div>
    )
  }

  if (creditOnly) {
    return (
      <div className="border rounded-xl p-4">
        <h2 className="font-semibold mb-2">{t('creditHeading')}</h2>
        <div className="grid grid-cols-1 gap-2 text-sm">
          <div><b>{t('creditWillUse')}</b>: {creditText ?? (pricing.credit != null ? String(pricing.credit) : '—')}</div>
        </div>
      </div>
    )
  }

  const p = pricing
  const hm = splitHoursToHM(p.estHours)
  const dn = splitDaysToDH(p.estDaysNormal)

  return (
    <div className="border rounded-xl p-4">
      <h2 className="font-semibold mb-2">{heading || t('heading')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        
         <div>
          <b>{t('price')}</b>:{" "}
          {typeof (displayAmount ?? p.priceFinal) === "number"
            ? (displayAmount ?? p.priceFinal)!.toLocaleString(locale)
            : "—"}{" "}
          {displayCurrency ?? t("currencyTRY")}
        </div>
        {creditBelowPriceText ? (
          <div><b>{t('creditAmount')}</b>: {creditBelowPriceText}</div>
        ) : null}
        <div><b>{t('targetDue')}</b>: {p.slaDueAt ? new Date(p.slaDueAt).toLocaleString(locale) : '—'}</div>
        <div className="md:col-span-2"><b>{t('selectedConsultant')}</b>: {(consultantName && consultantName.trim()) ? consultantName : t('teamFallback')}</div>
        {showCalc && (
          <div className="md:col-span-2">
            <b>{t('calc')}</b>: {(p.calcMode || 'heuristic').toUpperCase()} • {t('calcHourly')}: {p.baseHourly} {t('currencyTRY')} • {t('calcMin')}: {p.minFee} {t('currencyTRY')} • {t('calcUrgent')}{p.urgentMultiplier}
          </div>
        )}
      </div>
    </div>
  )
}
