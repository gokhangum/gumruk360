'use client'
import { useEffect, useState } from 'react'

type TierRow = { min?: number|null; max?: number|null; unit_price_lira: number; active?: boolean; id?: string }

type Settings = {
  credits_per_point: number
  low_balance_threshold_user: number
  low_balance_threshold_org: number
  credit_price_lira: number
  min_user_purchase_credits: number
  min_org_purchase_credits: number
    credit_discount_user: number
  credit_discount_org: number
  notify_emails: string[]
  tiers_user: TierRow[]
  tiers_org: TierRow[]
}

async function loadSettings(): Promise<Settings | null> {
  try {
    const res = await fetch('/api/admin/subscription-settings', { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return {
      credits_per_point: Number(data?.credits_per_point ?? 10),
      low_balance_threshold_user: Number(data?.low_balance_threshold_user ?? 0),
      low_balance_threshold_org: Number(data?.low_balance_threshold_org ?? 0),
      credit_price_lira: Number(data?.credit_price_lira ?? 0),
      min_user_purchase_credits: Number(data?.min_user_purchase_credits ?? 0),
      min_org_purchase_credits: Number(data?.min_org_purchase_credits ?? 0),
	    credit_discount_user: Number(data?.credit_discount_user ?? 0),
  credit_discount_org: Number(data?.credit_discount_org ?? 0),
      notify_emails: (data?.notify_emails || []) as string[],
      tiers_user: (data?.tiers_user || []) as TierRow[],
      tiers_org : (data?.tiers_org  || []) as TierRow[],
    }
  } catch { return null }
}

export default function AdminSubscriptionSettingsPage() {
  const [s, setS] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => { loadSettings().then(setS) }, [])

  function onChange<K extends keyof Settings>(k: K, v: any) {
    if (!s) return
    setS({ ...s, [k]: v })
  }

  function addRow(scope: 'user'|'org') {
    if (!s) return
    const key = scope === 'user' ? 'tiers_user' : 'tiers_org'
    const arr = [...(s as any)[key], { min: 0, max: null, unit_price_lira: 0, active: true }]
    setS({ ...s, [key]: arr } as any)
  }
  function delRow(scope: 'user'|'org', idx: number) {
    if (!s) return
    const key = scope === 'user' ? 'tiers_user' : 'tiers_org'
    const arr = [...(s as any)[key]]
    arr.splice(idx,1)
    setS({ ...s, [key]: arr } as any)
  }
  function setRow(scope: 'user'|'org', idx: number, row: TierRow) {
    if (!s) return
    const key = scope === 'user' ? 'tiers_user' : 'tiers_org'
    const arr = [...(s as any)[key]]
    arr[idx] = row
    setS({ ...s, [key]: arr } as any)
  }

  async function saveAll() {
    if (!s) return
    setSaving(true); setOk(false); setError(null)
    try {
      const payload = {
        credits_per_point: s.credits_per_point,
        low_balance_threshold_user: s.low_balance_threshold_user,
        low_balance_threshold_org: s.low_balance_threshold_org,
        credit_price_lira: s.credit_price_lira,
        min_user_purchase_credits: s.min_user_purchase_credits,
        min_org_purchase_credits: s.min_org_purchase_credits,
		credit_discount_user: s.credit_discount_user ?? 0,
  credit_discount_org:  s.credit_discount_org  ?? 0,
        notify_emails: s.notify_emails,
        tiers_user: s.tiers_user,
        tiers_org: s.tiers_org,
      }
      const res = await fetch('/api/admin/subscription-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Kaydedilemedi')
      setOk(true)
    } catch (e:any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!s) return <div className="p-6">Yükleniyor…</div>

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-xl font-semibold">Abonelik Ayarları</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Puan başına kredi</label>
          <input type="number" step="0.0001" className="w-full border rounded-md p-2"
            value={s.credits_per_point} onChange={(e)=>onChange('credits_per_point', Number(e.target.value))} />
          <p className="text-xs text-gray-500 mt-1">SLA puanı → kredi dönüşümü.</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Kullanıcı düşük bakiye eşiği</label>
          <input type="number" step="0.0001" className="w-full border rounded-md p-2"
            value={s.low_balance_threshold_user} onChange={(e)=>onChange('low_balance_threshold_user', Number(e.target.value))} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Kurum düşük bakiye eşiği</label>
          <input type="number" step="0.0001" className="w-full border rounded-md p-2"
            value={s.low_balance_threshold_org} onChange={(e)=>onChange('low_balance_threshold_org', Number(e.target.value))} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Bildirim e-postaları (virgülle)</label>
          <input type="text" className="w-full border rounded-md p-2"
            value={(s.notify_emails||[]).join(',')}
            onChange={(e)=>onChange('notify_emails', e.target.value.split(',').map(x=>x.trim()).filter(Boolean))} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Varsayılan 1 Kredi Fiyatı (TL)</label>
          <input type="number" step="0.0001" className="w-full border rounded-md p-2"
            value={s.credit_price_lira} onChange={(e)=>onChange('credit_price_lira', Number(e.target.value))} />
          <p className="text-xs text-gray-500 mt-1">Aralık eşleşmezse bu fiyat kullanılır.</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Minimum bireysel alım (adet)</label>
          <input type="number" step="1" min={0} className="w-full border rounded-md p-2"
            value={s.min_user_purchase_credits}
            onChange={(e)=>onChange('min_user_purchase_credits', Number(e.target.value))} />
          <p className="text-xs text-gray-500 mt-1">Bireysel kredi satın alırken minimum kredi adedi (ör: 10).</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Minimum kurumsal alım (adet)</label>
          <input type="number" step="1" min={0} className="w-full border rounded-md p-2"
            value={s.min_org_purchase_credits}
            onChange={(e)=>onChange('min_org_purchase_credits', Number(e.target.value))} />
          <p className="text-xs text-gray-500 mt-1">Kurumsal kredi satın alırken minimum kredi adedi (ör: 20).</p>
        </div>

{/* kredi iskontosu (user) */}
<div className="flex flex-col gap-1">
  <label className="text-sm font-medium">kredi iskontosu (user)</label>
  <input
    type="number"
    step="0.0001"
    min="0"
    max="1"
    value={s?.credit_discount_user ?? 0}
    onChange={(e) => onChange('credit_discount_user', Number(e.target.value || '0'))}
    className="border rounded-md px-3 py-2"
  />
  <p className="text-xs text-muted-foreground">% yerine 0–1 arası oran girin. Örn: 0.15 = %15 indirim</p>
</div>

{/* kredi iskontosu (corporate) */}
<div className="flex flex-col gap-1">
  <label className="text-sm font-medium">kredi iskontosu (corporate)</label>
  <input
    type="number"
    step="0.0001"
    min="0"
    max="1"
    value={s?.credit_discount_org ?? 0}
    onChange={(e) => onChange('credit_discount_org', Number(e.target.value || '0'))}
    className="border rounded-md px-3 py-2"
  />
  <p className="text-xs text-muted-foreground">% yerine 0–1 arası oran girin. Örn: 0.10 = %10 indirim</p>
</div>

      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Bireysel — Kademeli Fiyat Tablosu</h2>
        <TierTable rows={s.tiers_user} onChange={(rows)=>onChange('tiers_user', rows)} add={()=>addRow('user')} del={(i)=>delRow('user',i)} setRow={(i,r)=>setRow('user',i,r)} />
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Kurumsal — Kademeli Fiyat Tablosu</h2>
        <TierTable rows={s.tiers_org} onChange={(rows)=>onChange('tiers_org', rows)} add={()=>addRow('org')} del={(i)=>delRow('org',i)} setRow={(i,r)=>setRow('org',i,r)} />
      </section>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {ok && <div className="text-sm text-green-700">Kaydedildi.</div>}

      <div className="flex gap-3">
        <button onClick={saveAll} disabled={saving} className={"px-4 py-2 rounded text-white " + (saving?'bg-gray-400':'bg-black')}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <a href="/admin" className="px-4 py-2 rounded border">Geri</a>
      </div>
    </div>
  )
}

function TierTable({ rows, onChange, add, del, setRow }:{ rows: TierRow[], onChange:(r:TierRow[])=>void, add:()=>void, del:(i:number)=>void, setRow:(i:number,r:TierRow)=>void }) {
  return (
    <div className="border rounded-xl">
      <div className="grid grid-cols-12 text-sm font-medium p-3 border-b">
        <div className="col-span-3">Min</div>
        <div className="col-span-3">Maks (boş = ∞)</div>
        <div className="col-span-4">1 Kredi Fiyatı (TL)</div>
        <div className="col-span-2">Aktif</div>
      </div>
      {rows.length === 0 ? (
        <div className="p-3 text-sm text-gray-600">Satır yok</div>
      ) : rows.map((r, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 p-3 border-b items-center">
          <input className="col-span-3 border rounded-md p-2" type="number" step="0.0001" value={r.min ?? 0}
            onChange={(e)=>setRow(i, { ...r, min: Number(e.target.value) })} />
          <input className="col-span-3 border rounded-md p-2" type="number" step="0.0001" value={r.max ?? ''}
            placeholder="∞" onChange={(e)=>setRow(i, { ...r, max: e.target.value===''?null:Number(e.target.value) })} />
          <input className="col-span-4 border rounded-md p-2" type="number" step="0.0001" value={r.unit_price_lira}
            onChange={(e)=>setRow(i, { ...r, unit_price_lira: Number(e.target.value) })} />
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" checked={r.active!==false} onChange={(e)=>setRow(i, { ...r, active: e.target.checked })} />
            <button className="text-xs underline" onClick={()=>del(i)}>sil</button>
          </div>
        </div>
      ))}
      <div className="p-3">
        <button className="px-3 py-2 rounded border" onClick={add}>Satır Ekle</button>
      </div>
    </div>
  )
}
