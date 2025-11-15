'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

type Billing = {
  is_corporate: boolean
  full_name: string
  company_name: string
  tax_number: string
  tax_office: string
  address_line: string
  city: string
  country: string
  phone: string
  e_invoice: boolean
}

export default function BillingProfilePage() {
	const t = useTranslations('settings.billing')
  const [b, setB] = useState<Billing>({
    is_corporate: false, full_name: '', company_name: '', tax_number: '', tax_office: '',
    address_line: '', city: '', country: '', phone: '', e_invoice: false
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const res = await fetch('/api/settings/profile/billing', { cache: 'no-store' })
        const data = await res.json()
        if (mounted && res.ok) setB((prev)=>({ ...prev, ...data }))
      } finally { if (mounted) setLoading(false) }
    }
    load()
    return () => { mounted = false }
  }, [])

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/settings/profile/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || t('saveFailed'))
      setMsg(t('saved'))
    } catch (e:any) {
      setMsg(e.message)
    } finally { setSaving(false) }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      <h1 className="text-xl font-semibold">{t('title')}</h1>

      {loading ? <div>{t('loading')}</div> : (
        <div className="border rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <input type="radio" checked={!b.is_corporate} onChange={()=>setB({...b, is_corporate:false})} />
              <span>{t('individual')}</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={b.is_corporate} onChange={()=>setB({...b, is_corporate:true})} />
              <span>{t('corporate')}</span>
            </label>
          </div>

          {!b.is_corporate && (
            <div>
              <label className="block text-sm mb-1">{t('fullName')}</label>
              <input className="w-full border rounded-md p-2" value={b.full_name || ''} onChange={e=>setB({...b, full_name:e.target.value})} />
            </div>
          )}

          {b.is_corporate && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">{t('companyName')}</label>
                <input className="w-full border rounded-md p-2" value={b.company_name || ''} onChange={e=>setB({...b, company_name:e.target.value})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('taxNumber')}</label>
                <input className="w-full border rounded-md p-2" value={b.tax_number || ''} onChange={e=>setB({...b, tax_number:e.target.value})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('taxOffice')}</label>
                <input className="w-full border rounded-md p-2" value={b.tax_office || ''} onChange={e=>setB({...b, tax_office:e.target.value})} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm mb-1">{t('addressLine')}</label>
            <input className="w-full border rounded-md p-2" value={b.address_line || ''} onChange={e=>setB({...b, address_line:e.target.value})} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1">{t('city')}</label>
              <input className="w-full border rounded-md p-2" value={b.city || ''} onChange={e=>setB({...b, city:e.target.value})} />
            </div>
            <div>
              <label className="block text-sm mb-1">{t('country')}</label>
              <input className="w-full border rounded-md p-2" value={b.country || ''} onChange={e=>setB({...b, country:e.target.value})} />
            </div>
            <div>
              <label className="block text-sm mb-1">{t('phone')}</label>
              <input className="w-full border rounded-md p-2" value={b.phone || ''} onChange={e=>setB({...b, phone:e.target.value})} />
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!b.e_invoice} onChange={e=>setB({...b, e_invoice:e.target.checked})} />
            <span>{t('eInvoice')}</span>
          </label>

          {msg && <div className="text-sm">{msg}</div>}

          <div className="flex gap-3">
            <button onClick={save} disabled={saving} className={"px-4 py-2 rounded text-white "+(saving?'bg-gray-400':'bg-black')}>
              {saving ? t('saving') : t('save')}
            </button>
            <a href="/dashboard" className="px-4 py-2 rounded border">{t('back')}</a>
          </div>
        </div>
      )}
    </div>
  )
}
