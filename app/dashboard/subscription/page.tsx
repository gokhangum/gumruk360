// app/dashboard/subscription/page.tsx
'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import MembersDeleteButton from './MembersDeleteButton'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { useTranslations } from "next-intl";
function parseLowerBoundFromRange(r: string | null): number {
  if (!r) return Infinity
  const m = r.match(/^\s*[\[\(]\s*([0-9]+)(?:\.[0-9]+)?\s*,/)
  if (!m) return Infinity
  const v = Number(m[1])
  return Number.isFinite(v) ? v : Infinity
}


type LedgerRow = { id: string; change: number; reason: string; created_at: string; question_id?: string|null; question_title?: string|null; asker_name?: string|null }
type PurchaseRow = { id: string; change: number; created_at: string }
type Member = { user_id: string; email?: string; org_role: string; status?: string }

type Tier = {
  id: string
  scope_type: 'org' | 'user'
  credits_range: string | null
  unit_price_lira: number | null
  active: boolean | null
  created_at?: string | null
}

function formatCreditsRange(r: string | null | undefined): string {
  if (!r) return '—'
  const m = r.match(/^([\[\(])\s*([0-9]+)(?:\.[0-9]+)?\s*,\s*([0-9]+|infinity)(?:\.[0-9]+)?\s*([\]\)])$/i)
  if (!m) return r
  const open = m[1]
  const low = m[2] === 'infinity' ? Infinity : Number(m[2])
  const highRaw = m[3] === 'infinity' ? Infinity : Number(m[3])
  const close = m[4]

  let lowDisplay = low
  let highDisplay = highRaw
  if (!Number.isFinite(lowDisplay)) return '—'
  if (!Number.isFinite(highDisplay)) return `${lowDisplay}+ adet alımlar`
  if (open === '(') lowDisplay = lowDisplay + 1
  if (close === ')') highDisplay = highDisplay - 1
  return `${lowDisplay} - ${highDisplay} adet arası alımlar`
}

export default function SubscriptionPage() {
	const tDash = useTranslations("dashboard.subscription");
const tCred = useTranslations("cred");
const tCommon = useTranslations("common");
const tProgress = useTranslations("progress");
const tQuestions = useTranslations("questions.detail");

  const [tab, setTab] = useState<'purchases'|'usage'|'members'>('purchases')
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [usage, setUsage] = useState<LedgerRow[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [invEmail, setInvEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string|null>(null)
  const [orgBalance, setOrgBalance] = useState<number | null>(null)
const [isOwner, setIsOwner] = useState<boolean | null>(null)
  const [creditsToBuy, setCreditsToBuy] = useState<string>('100') // was '50.0000' → trimmed
const [pricingOpen, setPricingOpen] = useState(false)
const iframeRef = useRef<HTMLIFrameElement | null>(null)
const [ifrW, setIfrW] = useState<number | null>(null)
const [ifrH, setIfrH] = useState<number | null>(null)

  // Number formatter that does NOT force trailing zeros
  const nf = useMemo(() => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }), [])
  const fmt0 = (n: number) => nf.format(n)

  
  const [minOrgPurchase, setMinOrgPurchase] = useState<number>(0)

  const supabase = useMemo(() => createClientComponentClient(), [])
const router = useRouter()
const sizeToContent = () => {
  const ifr = iframeRef.current
  if (!ifr) return
  const doc = ifr.contentWindow?.document
  if (!doc) return
  const w = Math.ceil(Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth ?? 0))
  const h = Math.ceil(Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0))
  // Ekrana taşmaması için mantıklı sınırlar
  const maxW = Math.max(320, window.innerWidth - 40)
  const maxH = Math.max(240, window.innerHeight - 80)
  setIfrW(Math.min(w, maxW))
  setIfrH(Math.min(h, maxH))
}

useEffect(() => {
  if (!pricingOpen) return
  sizeToContent() // ilk yüklemede ölç
  const id = setInterval(sizeToContent, 400) // dinamik içerik için periyodik ölç
  return () => clearInterval(id)
}, [pricingOpen])



  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/dashboard/subscription', { cache: 'no-store' })
        const data = await res.json()
        if (mounted) {
          setPurchases(data.purchases || [])
          setUsage(data.usage || [])
          setMembers(data.members || [])
		  setIsOwner(data.isOwner ?? null)
        }
      } finally {
        if (mounted) setLoading(false)
      }
      try {
        const b = await fetch('/api/dashboard/balance', { cache: 'no-store' })
        const bj = await b.json()
        if (mounted) setOrgBalance(bj.orgBalance ?? 0)
      } catch {}
    }
    load()
    return () => { mounted = false }
  }, [])

  async function goCheckout() {
    const val = Number(creditsToBuy)
    
    
    let minValue = Number(minOrgPurchase ?? 0)
    try {
      // 1) Try subscription_settings
      const { data: d1 } = await supabase
        .from('subscription_settings')
        .select('min_org_purchase_credits')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const fromSettings = Number(d1?.min_org_purchase_credits ?? 0)
      if (Number.isFinite(fromSettings) && fromSettings > 0) {
        minValue = fromSettings
        setMinOrgPurchase(fromSettings)
      } else {
        // 2) Fallback: find the lowest lower-bound from active tiers for this scope
        const { data: tiers } = await supabase
          .from('credit_price_tiers')
          .select('credits_range, active, scope_type')
          .eq('active', true)
          .eq('scope_type', 'org')
        const lows = (tiers ?? []).map(t => parseLowerBoundFromRange(t.credits_range ?? null)).filter(n => Number.isFinite(n))
        const minLower = lows.length > 0 ? Math.min(...lows) : 0
        if (Number.isFinite(minLower) && minLower > 0) {
          minValue = minLower
          setMinOrgPurchase(minLower)
        }
      }
    } catch { /* ignore */ }
try {
      // Eşik henüz yüklenmediyse veya 0 ise, tık anında tekrar oku
      if (!Number.isFinite(minOrgPurchase as unknown as number) || Number(minOrgPurchase) <= 0) {
        const { data, error } = await supabase
          .from('subscription_settings')
          .select('min_org_purchase_credits')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!error) {
          const v = Number(data?.min_org_purchase_credits ?? 0)
          if (!Number.isNaN(v)) {
            setMinOrgPurchase(v)
          }
        }
      }
    } catch {} 
if (!isFinite(val) || val <= 0) return alert(tCred("buy.enterValidAmount"));
if (Number.isFinite(minValue) && val < Number(minValue)) return alert(tCred("buy.minPurchase", { count: minValue }));
if (Number.isFinite(minOrgPurchase) && val < Number(minOrgPurchase)) return alert(tCred("buy.minPurchase", { count: minOrgPurchase }));

    window.location.href = `/checkout?scope_type=org&credits=${val}`
  }
const formatCreditsRangeI18n = (r?: string|null) => {
  if (!r) return "—";
  const m = r.match(/^([\[\(])\s*([0-9]+)(?:\.[0-9]+)?\s*,\s*([0-9]+|infinity)(?:\.[0-9]+)?\s*([\]\)])$/i);
  if (!m) return r;
  const open = m[1];
  let low = m[2] === "infinity" ? Infinity : Number(m[2]);
  let high = m[3] === "infinity" ? Infinity : Number(m[3]);
  if (!Number.isFinite(low)) return "—";
  if (open === "(") low = (low as number) + 1;
  if (m[4] === ")") high = (high as number) - 1;
  if (!Number.isFinite(high)) return tCred("range.plus", { count: low });
  return tCred("range.between", { min: low, max: high });
};



  async function invite() {
    setMessage(null)
    try {
      const res = await fetch('/api/dashboard/subscription/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invEmail })
      })
      const data = await res.json()
      if (data.ok) setMessage('Davet gönderildi / eklendi')
      else setMessage(data.error || 'Hata')
    } catch (e) {
      setMessage('Hata')
    }
  }
  async function refreshMembers() {
    try {
      const res = await fetch('/api/dashboard/subscription', { cache: 'no-store' })
      const data = await res.json()
      setPurchases(data.purchases || [])
      setUsage(data.usage || [])
      setMembers(data.members || [])
	  setIsOwner(data.isOwner ?? null)
    } catch {}
  }
const goTab = (tabId: 'purchases' | 'usage' | 'members') => {
  if (tabId === 'members' && isOwner === false) {
    alert(tDash("onlyOwnerCanView"));
    return;
  }
  setTab(tabId);
};
  return (
     
    <div className="w-full max-w-none md:max-w-[clamp(320px,90vw,1680px)] -mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
        <div className="card-surface shadow-colored p-5 md:p-6 space-y-5">
      <h1 className="text-lg font-semibold tracking-tight">{tDash("title")}</h1>

     <div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
       <div className="flex items-center gap-2">
        <div>
             <b>{tDash("orgBalanceLabel")}</b>: {orgBalance != null ? fmt0(orgBalance) : "—"}
         </div>
         <input
            value={creditsToBuy}
            onChange={(e) => setCreditsToBuy(e.target.value)}
         className="border rounded-md p-2 w-24 md:w-32"
          />
     </div>
        <div className="flex gap-2">
           <button className="btn btn--primary btn--cta" onClick={goCheckout}>
             {tDash("loadCredits")}
        </button>
         <button
           type="button"
         onClick={() => setPricingOpen(true)}
            className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
          title={tCred("pricing.open")}
          >
            {tCred("pricing.open")}
          </button>
        </div>
     </div>

      <div className="flex gap-3">
        <button className={"btn btn--ghost text-sm " + (tab==='purchases' ? 'aria-pressed' : '')} onClick={()=>setTab('purchases')}>{tDash("tabs.purchases")}</button>
        <button className={"btn btn--ghost text-sm " + (tab==='usage' ? 'aria-pressed' : '')} onClick={()=>setTab('usage')}>{tDash("tabs.usage")}</button>
       <button className={"btn btn--ghost text-sm " + (tab==='members' ? 'aria-pressed' : '')} onClick={()=>goTab('members')}>{tDash("tabs.members")}</button>
      </div>

      {tab==='purchases' && (
        <section className="space-y-2">
          <div className="card-surface p-0 divide-y edge-underline edge-blue edge-taper edge-rise-2mm">
           {loading ? <div className="p-3">{tProgress("processing")}</div> : (purchases.length===0 ? <div className="p-3 text-sm text-gray-600">{isOwner === false ? tDash("onlyOwnerCanView") : tCred("empty")}</div> : purchases.slice(0, 20).map(r => (
              <div key={r.id} className="p-3 text-sm flex items-center justify-between">
                <div>+{fmt0(Number(r.change))} {tCred("units.credit")}</div>

                <div className="text-gray-500">{new Date(r.created_at).toLocaleString('tr-TR')}</div>
              </div>
            )))}
          </div>
          <a href="/dashboard/subscription/history" className="text-sm underline">{tDash("historyLink")}</a>
        </section>
      )}

      {tab==='usage' && (
        <section className="space-y-2">
          <div className="card-surface p-0 divide-y edge-underline edge-blue edge-taper edge-rise-2mm">
          <div className="flex items-center justify-end px-2 pt-2">
            <a onClick={(e)=>{ if (isOwner === false) { e.preventDefault(); alert(tDash("onlyOwnerCanView")); } }}
              href="/api/dashboard/subscription/export"
              className="btn btn--outline text-sm"
            >
              {tDash("exportExcel")}
            </a>
          </div>

           {loading ? <div className="p-3">{tProgress("processing")}</div> : (usage.length===0 ? <div className="p-3 text-sm text-gray-600">{isOwner === false ? tDash("onlyOwnerCanView") : tCred("empty")}</div> : usage.slice(0, 20).map(r => (
              <div key={r.id} className="p-3 text-sm grid grid-cols-4 gap-2">
                <div>-{fmt0(Math.abs(Number(r.change)))} {tCred("units.credit")}</div>

                <div>{r.question_id ? (
                  <a href={`/dashboard/questions/${r.question_id}`} className="underline text-blue-600 hover:text-blue-700" title={tCred("usage.openQuestion")}
>
                    {r.question_title ?? tDash("questionFallback")}

                  </a>
                ) : (
                  <span>{r.reason}</span>
                )}</div>
                <div>{r.asker_name ?? '-'}</div>
                <div className="text-gray-500">{new Date(r.created_at).toLocaleString('tr-TR')}</div>
              </div>
            )))}
          </div>
		  <a href="/dashboard/subscription/history" className="text-sm underline">{tDash("historyLink")}</a>
</section>
      )}

      {tab==='members' && (
        <section className="space-y-3">
          <div className="flex gap-2">
            <input value={invEmail} onChange={(e)=>setInvEmail(e.target.value)} placeholder="email@domain.com" className="border rounded-md p-2 w-full" />
            <button onClick={invite} className="px-3 py-2 rounded bg-black text-white">{tDash("invite")}</button>
          </div>
          {message && <div className="text-sm">{message}</div>}
          <div className="border rounded-xl divide-y">
            {loading ? <div className="p-3">{tProgress("processing")}</div> : (members.length===0 ? <div className="p-3 text-sm text-gray-600">{tDash("noMembers")}</div> : members.map(m => (
              <div key={m.user_id} className="p-3 text-sm grid grid-cols-4 gap-2 items-center">
                <div>{m.email || m.user_id}</div>
                <div>{m.org_role}</div>
                <div className="text-gray-500">{m.status || '—'}</div>
                <div className="text-right">
                  {m.org_role !== 'owner' && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/dashboard/subscription/members/${m.user_id}`, { method: 'DELETE' })
                          const j = await res.json()
                          if (!res.ok || !j?.ok) throw new Error(j?.error || tCommon("deleteFailed"))
                          await refreshMembers()
                        } catch (e) {
                          alert(tCommon("deleteFailed"))
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg border text-sm hover:opacity-90 transition disabled:opacity-50 bg-red-600 text-white"
                      title={tDash("removeMemberTitle")}
                    >
                      {tCommon("delete")}
                    </button>
                  )}
                </div>
              </div>
            )))}
          </div>
        </section>
      )}
	  {pricingOpen && (
  <div
    className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4"
    onClick={() => setPricingOpen(false)}
  >
   <div
       className="w-full max-w-2xl rounded-2xl bg-white shadow-xl overflow-hidden"
       onClick={(e) => e.stopPropagation()}
       style={{
         width: ifrW ? `${ifrW}px` : 'min(90vw, 1000px)',
         height: ifrH ? `${ifrH}px` : 'min(85vh, 700px)',
         maxWidth: '90vw',
         maxHeight: '85vh'
       }}
     >
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-semibold">{tCred("pricing.open")}</h2>
        <button
          type="button"
          onClick={() => setPricingOpen(false)}
          className="rounded px-2 py-1 text-sm hover:bg-gray-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
     <iframe
         ref={iframeRef}
         src="/pricepopup"
         className="w-full h-full"
         title="Credit Pricing"
         onLoad={sizeToContent}
       />
    </div>
  </div>
)}

    </div> 
	</div>  
    
  )
}
