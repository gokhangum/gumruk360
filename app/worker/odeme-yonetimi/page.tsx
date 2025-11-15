
'use client'
import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

type Item = {
  id: string
  created_at: string
  currency: 'TRY' | 'USD'
  payment_amount: number
  kur: number
  fx: number
  final_amount: number
  agreement_rate: number | null
  hakedis: number | null
}

function fmt(n: number, d=2){
  return (Number(n)||0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
}

export default function WorkerPaymentsPage(){
  const t = useTranslations('worker.payments')
  const [tab, setTab] = useState<'make'|'list'>('make')
  const [items, setItems] = useState<Item[]>([])
  const [tenantKey, setTenantKey] = useState('tr')
  const [agreementRate, setAgreementRate] = useState<number|null>(null)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState(false)
  const [list, setList] = useState<any[]>([])

  async function loadMake(){
    setLoading(true)
    try{
      const res = await fetch('/api/worker/payments/questions')
      const js = await res.json()
      if(js.ok){
        setItems(js.items || [])
        setTenantKey(js.tenant_key || 'tr')
        setAgreementRate(js.agreement_rate ?? null)
      }
    }finally{ setLoading(false) }
  }
  async function loadList(){
    setLoading(true)
    try{
      const res = await fetch('/api/admin/payment-requests?worker_id=me', { cache: 'no-store' })
      const js = await res.json()
      if(js.ok){
        setList(js.items || [])
      }
    }finally{ setLoading(false) }
  }

  useEffect(() => {
    if(tab==='make') loadMake(); else loadList();
  }, [tab])

  const selectedIds = useMemo(() => Object.keys(sel).filter(k => sel[k]), [sel])
  const totalHakedis = useMemo(() => items.filter(i=>sel[i.id]).reduce((a,b)=> a + (Number(b.hakedis)||0), 0), [items, sel])

  async function createRequest(){
    if(selectedIds.length===0) return
    setCreating(true)
    try{
      const res = await fetch('/api/worker/payments/requests', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ question_ids: selectedIds }) })
      const js = await res.json()
      if(js.ok){
        alert(t('createdOk', { code: js.code }))
        setSel({})
        loadMake()
      }else{
        alert(js.error || 'error')
      }
    }finally{ setCreating(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b">
        <button className={`px-3 py-2 ${tab==='make'?'border-b-2 font-semibold':''}`} onClick={()=>setTab('make')}>{t('tabMake')}</button>
        <button className={`px-3 py-2 ${tab==='list'?'border-b-2 font-semibold':''}`} onClick={()=>setTab('list')}>{t('tabList')}</button>
      </div>

      {tab==='make' ? (
        <section className="space-y-4">
          <div className="text-sm text-gray-600">
            {t('agreementRate')}: {agreementRate==null ? t('agreementRateNA') : fmt(agreementRate*100, 2)+'%'}
          </div>
          <div className="overflow-auto rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="p-2 border"></th>
                  <th className="p-2 border">{t('colQuestionId')}</th>
                  <th className="p-2 border">{t('colDate')}</th>
                  <th className="p-2 border">{t('colCurrency')}</th>
                  <th className="p-2 border">{t('colAmount')}</th>
                  <th className="p-2 border">{t('colKur')}</th>
                  <th className="p-2 border">{t('colFx')}</th>
                  <th className="p-2 border">{t('colFinal')}</th>
                  <th className="p-2 border">{t('colAgreement')}</th>
                  <th className="p-2 border">{t('colHakedis')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id}>
                    <td className="p-2 border">
                      <input type="checkbox" checked={!!sel[it.id]} onChange={(e)=>setSel(s=>({...s, [it.id]: e.target.checked}))} />
                    </td>
                    <td className="p-2 border">{it.id}</td>
                    <td className="p-2 border">{it.created_at?.slice(0,10)}</td>
                    <td className="p-2 border">{it.currency}</td>
                    <td className="p-2 border">{fmt(it.payment_amount)}</td>
                    <td className="p-2 border">{fmt(it.kur,4)}</td>
                    <td className="p-2 border">{fmt(it.fx,4)}</td>
                    <td className="p-2 border">{fmt(it.final_amount)}</td>
                    <td className="p-2 border">{it.agreement_rate==null? '—' : fmt(it.agreement_rate*100,2)+'%'}</td>
                    <td className="p-2 border font-semibold">{it.hakedis==null? '—' : fmt(it.hakedis)}</td>
                  </tr>
                ))}
                {items.length===0 && (
                  <tr><td className="p-4 text-center text-gray-500" colSpan={10}>{t('noRows')}</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="p-2 border" colSpan={9} style={{textAlign:'right'}}><strong>{t('totalHakedis')}</strong></td>
                  <td className="p-2 border font-bold">{fmt(totalHakedis)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex justify-end">
            <button disabled={creating || selectedIds.length===0 || agreementRate==null} onClick={createRequest} className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50">{t('createRequest')}</button>
          </div>
        </section>
      ) : (
        <section className="overflow-auto rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="p-2 border">{t('colReqCode')}</th>
                <th className="p-2 border">{t('colTotal')}</th>
                <th className="p-2 border">{t('colStatus')}</th>
                <th className="p-2 border">{t('colPayRef')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r: any) => (
                <tr key={r.code}>
                  <td className="p-2 border">{r.code}</td>
                  <td className="p-2 border">{fmt(r.total_settlement||0)} {r.currency||''}</td>
                  <td className="p-2 border">{t('status.'+r.status)}</td>
                  <td className="p-2 border">{r.payment_reference || '—'}</td>
                </tr>
              ))}
              {list.length===0 && (
                <tr><td className="p-4 text-center text-gray-500" colSpan={4}>{t('noRows')}</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
