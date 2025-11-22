// app/dashboard/credits/page.tsx
'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { pushEvent } from "@/lib/datalayer";
type PurchaseRow = { id: string; change: number; created_at: string; reason?: string; order_id?: string|null }
type LedgerRow   = {
  id: string;
  change: number;
  created_at: string;
  reason: string;
  question_id?: string | null;
  question_title?: string | null;
}

type Tier = {
  id: string
  scope_type: 'org' | 'user'
  credits_range: string | null // numrange string, ör: [30,100)
  unit_price_lira: number | null
  active: boolean | null
  created_at?: string | null
}

function getQueryParam(name: string): string | null {
  if (typeof window === 'undefined') return null
  const p = new URLSearchParams(window.location.search)
  const v = p.get(name)
  return v && v.trim().length ? v.trim() : null
}

function setQueryParam(name: string, value: string) {
  const url = new URL(window.location.href)
  if (value) url.searchParams.set(name, value)
  else url.searchParams.delete(name)
  window.history.replaceState({}, '', url.toString())
}

// numrange string'ini kullanıcı dostu metne çevir
function formatCreditsRange(
  r: string | null | undefined,
  t: (key: string, values?: Record<string, any>) => string
): string {

  if (!r) return '—'
  // ör: [30,100) | (100,200] | [301,1000)
  const m = r.match(/^([\[\(])\s*([0-9]+)(?:\.[0-9]+)?\s*,\s*([0-9]+|infinity)(?:\.[0-9]+)?\s*([\]\)])$/i)
  if (!m) return r
  const open = m[1] // [ veya (
  const low = m[2] === 'infinity' ? Infinity : Number(m[2])
  const highRaw = m[3] === 'infinity' ? Infinity : Number(m[3])
  const close = m[4] // ] veya )

  // alt sınır gösterimi
  let lowDisplay = low
  if (!Number.isFinite(lowDisplay)) return '—'

  // üst sınır gösterimi
  let highDisplay = highRaw
  if (!Number.isFinite(highDisplay)) {
    return t("range.plus", { count: lowDisplay })

  }

  // Parantez türüne göre sınırları ayarla (tam sayı aralığı bekleniyor)
  if (open === '(') {
    // (a, b] → a+1
    lowDisplay = lowDisplay + 1
  }
  if (close === ')') {
    // [a, b) → b-1
    highDisplay = highDisplay - 1
  }

  return t("range.between", { min: lowDisplay, max: highDisplay })


}

export default function CreditsPage() {
	const t = useTranslations("cred");
const locale = useLocale();
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [usage, setUsage] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState<number | null>(null)
  const [creditsToBuy, setCreditsToBuy] = useState<string>('30')
  const [emailParam, setEmailParam] = useState<string | null>(null)

  // Pricing popup state
  const [pricingOpen, setPricingOpen] = useState(false)
  const [pricingLoading, setPricingLoading] = useState(false)
  const [pricingRows, setPricingRows] = useState<Tier[]>([])
  const [pricingScope, setPricingScope] = useState<'org' | 'user'>('user')
  const [minUserPurchase, setMinUserPurchase] = useState<number>(0)
  const pricingLoadedOnceRef = useRef(false)

  const supabase = useMemo(() => createClientComponentClient(), [])

const nf = useMemo(() => new Intl.NumberFormat(locale, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
}), [locale])

  const fmt = (n: number) => nf.format(n)

function parseLowerBoundFromRange(r: string | null): number {
  if (!r) return Infinity
  const m = r.match(/^\s*[\[\(]\s*([0-9]+)(?:\.[0-9]+)?\s*,/)
  if (!m) return Infinity
  const v = Number(m[1])
  return Number.isFinite(v) ? v : Infinity
}


  
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('subscription_settings')
          .select('min_user_purchase_credits')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!error && mounted) setMinUserPurchase(Number(data?.min_user_purchase_credits ?? 0))
      } catch {}
    })()
    return () => { mounted = false }
  }, [supabase])
useEffect(() => {
    const fromUrl = getQueryParam('email')
    if (fromUrl) {
      setEmailParam(fromUrl)
      sessionStorage.setItem('g360_email', fromUrl)
      return
    }
    const fromStore = sessionStorage.getItem('g360_email')
    if (fromStore) {
      setEmailParam(fromStore)
      setQueryParam('email', fromStore)
    } else {
      setEmailParam(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      const qs = emailParam ? `?email=${encodeURIComponent(emailParam)}` : ''
      try {
        const res = await fetch(`/api/dashboard/credits${qs}`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (mounted) {
            setPurchases(data.purchases || [])
            setUsage(data.usage || [])
          }
        } else {
          if (mounted) { setPurchases([]); setUsage([]) }
        }
      } catch {
        if (mounted) { setPurchases([]); setUsage([]) }
      } finally {
        if (mounted) setLoading(false)
      }
      try {
        const b = await fetch(`/api/dashboard/balance${qs}`, { cache: 'no-store' })
        if (b.ok) {
          const bj = await b.json()
          if (mounted) setBalance(bj.user_balance ?? 0)
        } else {
          if (mounted) setBalance(null)
        }
      } catch {
        if (mounted) setBalance(null)
      }
    }
    load()
    return () => { mounted = false }
  }, [emailParam])

  const processedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!usage || usage.length === 0) return

      const qIds = Array.from(new Set(
        usage
          .filter(u => u.reason === 'question_debit' && u.question_id)
          .map(u => u.question_id as string)
      ))
      if (qIds.length === 0) return

      const toFetch = qIds.filter(id => !processedIdsRef.current.has(id))
      if (toFetch.length === 0) return

      const { data: qRows, error } = await supabase
        .from('questions')
        .select('id, title')
        .in('id', toFetch)

      if (error) return
      const qMap = new Map((qRows ?? []).map(r => [r.id as string, (r as any).title ?? '']))

      if (!mounted) return

      toFetch.forEach(id => processedIdsRef.current.add(id))

      let changed = false
      const next = (usage ?? []).map(u => {
        if (u.reason === 'question_debit' && u.question_id && !u.question_title) {
          const titleFromMap = qMap.get(u.question_id)

          if (typeof t !== 'undefined') {
            changed = true
            return { ...u, question_title: titleFromMap || t('table.questionFallback') }

          }
        }
        return u
      })

      if (changed) setUsage(next)
    })()
    return () => { mounted = false }
  }, [usage, supabase])

  async function goCheckout() {
    const val = Number(creditsToBuy)
    
    
    let minValue = Number(minUserPurchase ?? 0)
    try {
      // 1) Try subscription_settings
      const { data: d1 } = await supabase
        .from('subscription_settings')
        .select('min_user_purchase_credits')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const fromSettings = Number(d1?.min_user_purchase_credits ?? 0)
      if (Number.isFinite(fromSettings) && fromSettings > 0) {
        minValue = fromSettings
        setMinUserPurchase(fromSettings)
      } else {
        // 2) Fallback: find the lowest lower-bound from active tiers for this scope
        const { data: tiers } = await supabase
          .from('credit_price_tiers')
          .select('credits_range, active, scope_type')
          .eq('active', true)
          .eq('scope_type', 'user')
        const lows = (tiers ?? []).map(t => parseLowerBoundFromRange(t.credits_range ?? null)).filter(n => Number.isFinite(n))
        const minLower = lows.length > 0 ? Math.min(...lows) : 0
        if (Number.isFinite(minLower) && minLower > 0) {
          minValue = minLower
          setMinUserPurchase(minLower)
        }
      }
    } catch { /* ignore */ }
try {
      // Eşik henüz yüklenmediyse veya 0 ise, tık anında tekrar oku
      if (!Number.isFinite(minUserPurchase as unknown as number) || Number(minUserPurchase) <= 0) {
        const { data, error } = await supabase
          .from('subscription_settings')
          .select('min_user_purchase_credits')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!error) {
          const v = Number(data?.min_user_purchase_credits ?? 0)
          if (!Number.isNaN(v)) {
            setMinUserPurchase(v)
          }
        }
      }
    } catch {} 
if (!isFinite(val) || val <= 0) return alert(t('buy.enterValidAmount'))

    if (Number.isFinite(minValue) && val < Number(minValue)) return alert(t('buy.minPurchase', { count: minValue }))
    if (Number.isFinite(minUserPurchase) && val < Number(minUserPurchase)) return alert(t('buy.minPurchase', { count: minUserPurchase }))

    if (Number.isFinite(minUserPurchase) && val < Number(minUserPurchase)) return alert(t('buy.minPurchase', { count: minUserPurchase }))

    if (Number.isFinite(minUserPurchase) && val < Number(minUserPurchase)) return alert(t('buy.minPurchase', { count: minUserPurchase }))
   try {
    const host = typeof window !== "undefined" ? window.location.hostname : ""
      const tenant = /easycustoms360\.com$/i.test(host) ? "easycustoms360" : "gumruk360"
     const fullLocale = locale === "en" ? "en-US" : "tr-TR"

      pushEvent("credits_topup_checkout", {
        tenant,
         locale: fullLocale,
      scope_type: "user",
        credits: val,
     })
  } catch {
       // analytics hatası akışı bozmamalı
   }
    const emailQs = emailParam ? `&email=${encodeURIComponent(emailParam)}` : ''
    window.location.href = `/checkout?scope_type=user&credits=${val}${emailQs}`
  }

  async function openPricing() {
    setPricingOpen(true)
    if (pricingLoadedOnceRef.current) return
    pricingLoadedOnceRef.current = true
    setPricingLoading(true)
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const uid = userRes?.user?.id || null
      let scope: 'org' | 'user' = 'user'
      if (uid) {
        const { data: orgRows } = await supabase
          .from('organization_members')
          .select('org_id')
          .eq('user_id', uid)
          .eq('status', 'active')
          .limit(1)
        if (orgRows && orgRows.length > 0) scope = 'org'
      }
      setPricingScope(scope)

      const { data: tiers, error } = await supabase
        .from('credit_price_tiers')
        .select('id, scope_type, credits_range, unit_price_lira, active, created_at')
        .eq('scope_type', scope)
        .eq('active', true)

      if (!error) {
        const sorted = (tiers ?? []).slice().sort((a, b) => {


          // sort by numeric lower bound
          const am = (a.credits_range ?? '').match(/^[\[\(]\s*([0-9]+)/)
          const bm = (b.credits_range ?? '').match(/^[\[\(]\s*([0-9]+)/)
          const an = am ? Number(am[1]) : Number.MAX_SAFE_INTEGER
          const bn = bm ? Number(bm[1]) : Number.MAX_SAFE_INTEGER
          return an - bn
        })
        setPricingRows(sorted as Tier[])
      }
    } finally {
      setPricingLoading(false)
    }
  }

  return (
      <div className="-mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 w-full max-w-none md:max-w-[928px]">
        <div className="card-surface shadow-colored rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
	         <div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 mb-4 flex items-center gap-3">
	   <button type="button" className="btn btn--primary btn--cta">
        {t('page.title')}  
      </button>
	  </div>
      <div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4">
        <div><b>{t('page.balanceLabel')}</b> {balance != null ? fmt(balance) : '—'}</div>

        <div className="flex flex-col md:flex-row gap-2 md:gap-3 w-full md:w-auto">
          {/* 1. satır: yalnızca input (mobilde tam genişlik) */}
           <div className="flex items-center gap-2 w-full md:w-auto">
             <input
              value={creditsToBuy}
             onChange={(e)=>setCreditsToBuy(e.target.value)}
             className="border rounded-md p-2 w-full md:w-32"
             />
          </div>
          {/* 2. satır: butonlar */}
           <div className="flex items-center gap-2">
          <button className="btn btn--primary btn--cta md:whitespace-nowrap" onClick={goCheckout}>
             {t('page.loadButton')}
            </button>
           <button
              type="button"
              onClick={openPricing}
               className="btn btn--ghost text-sm md:whitespace-nowrap"
             title={t('pricing.open')}
           >
              {t('pricing.open')}
           </button>
</div></div>
      </div>

      {pricingOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPricingOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-3">
               <h2 className="text-lg font-semibold">{t('pricing.open')}</h2>
               <button
                 onClick={() => setPricingOpen(false)}
                 className="rounded px-2 py-1 text-sm hover:bg-gray-100"
                 aria-label={t('common.close')}
               >
                 ✕
               </button>
             </div>
             <iframe
               src="/pricepopup"
               title="Credit Pricing"
               className="w-full h-[75vh] block"
             />
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">{t('purchases.titleRecent3')}</h2>

        <div className="card-surface p-0 divide-y edge-underline edge-blue edge-taper edge-rise-2mm">
          {loading ? (
            <div className="p-3">{t('loading')}</div>
          ) : purchases.length===0 ? (
            <div className="p-3 text-sm text-gray-600">{t('empty')}</div>
          ) : purchases.map(r => (
            <div key={r.id} className="p-3 text-sm grid grid-cols-3 gap-2">
              <div>+{fmt(Number(r.change))} {t('units.credit')}</div>

             <div>{r.reason || t('usage.purchase')} {r.order_id ? `#${r.order_id.slice(0,8)}` : ''}</div>

              <div className="text-gray-500">{new Date(r.created_at).toLocaleString(locale)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
       <h2 className="font-medium">{t('usage.title')}</h2>

       <div className="card-surface p-0 divide-y edge-underline edge-blue edge-taper edge-rise-2mm">
          {loading ? (
            <div className="p-3">{t('loading')}</div>

          ) : usage.length===0 ? (
            <div className="p-3 text-sm text-gray-600">{t('empty')}</div>

          ) : usage.map(r => (
            <div key={r.id} className="p-3 text-sm grid grid-cols-3 gap-2">
              <div>-{fmt(Math.abs(Number(r.change)))} {t('units.credit')}</div>

              <div>
                {r.reason === 'question_debit' && r.question_id ? (
                  <Link href={`/dashboard/questions/${r.question_id}`} className="underline text-blue-600 hover:text-blue-700" title={t('usage.openQuestion')}>
                    {r.question_title ?? t('usage.questionFallback')}

                  </Link>
                ) : (
                  <span>{r.reason}</span>
                )}
              </div>
              <div className="text-gray-500">{new Date(r.created_at).toLocaleString(locale)}</div>
            </div>
          ))}
        </div>


      </section>
    </div>
	</div>
	</div>
  )
}
