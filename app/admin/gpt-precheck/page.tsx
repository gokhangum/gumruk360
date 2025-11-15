'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type VisibleGroups = {
  required: boolean
  should: boolean
  info: boolean
}

type PassPolicy = {
  mode: 'required_only' | 'required_and_should'
  should_max?: number
}

type Settings = {
  id?: string
  domain: string
  locale: 'tr' | 'en'
  meaningful_confidence_min: number
  customs_related_confidence_min: number
  l2_prompt?: string | null
  l2_visible_groups?: VisibleGroups | null
  l2_pass_policy?: PassPolicy | null
  l2_strictness?: number | null
  updated_by?: string | null
  updated_at?: string | null
}

export default function AdminGptPrecheckPage() {
  const router = useRouter()
  const [locale, setLocale] = useState<'tr'|'en'>('tr')
  const [form, setForm] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const applyDefaults = (s: any): Settings => {
    const vg: VisibleGroups = {
      required: s?.l2_visible_groups?.required ?? true,
      should: s?.l2_visible_groups?.should ?? true,
      info: s?.l2_visible_groups?.info ?? true,
    }
    const pp: PassPolicy = {
      mode: (s?.l2_pass_policy?.mode === 'required_and_should') ? 'required_and_should' : 'required_only',
      should_max: typeof s?.l2_pass_policy?.should_max === 'number' && s?.l2_pass_policy?.should_max >= 0
        ? Math.floor(s.l2_pass_policy.should_max)
        : 0,
    }
    return {
      id: s?.id || undefined,
      domain: s?.domain || (typeof window !== 'undefined' ? window.location.hostname : ''),
      locale: (s?.locale || locale || 'tr'),
      meaningful_confidence_min: typeof s?.meaningful_confidence_min === 'number' ? s.meaningful_confidence_min : 0.7,
      customs_related_confidence_min: typeof s?.customs_related_confidence_min === 'number' ? s.customs_related_confidence_min : 0.7,
      l2_prompt: (typeof s?.l2_prompt === 'string') ? s.l2_prompt : '',
      l2_visible_groups: vg,
      l2_pass_policy: pp,
      l2_strictness: (typeof s?.l2_strictness === 'number') ? s.l2_strictness : 1,
      updated_by: s?.updated_by ?? null,
      updated_at: s?.updated_at ?? null,
    }
  }

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetch(`/api/admin/gpt-precheck/settings?locale=${locale}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!mounted) return
        if (r.ok && j?.ok && j?.data) {
          setForm(applyDefaults(j.data))
        } else {
          setForm(applyDefaults({ locale }))
        }
      })
      .catch(() => {
        if (!mounted) return
        setForm(applyDefaults({ locale }))
      })
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [locale])

  const save = async () => {
    if (!form) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/gpt-precheck/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale: form.locale,
          meaningful_confidence_min: form.meaningful_confidence_min,
          customs_related_confidence_min: form.customs_related_confidence_min,
          l2_prompt: form.l2_prompt ?? '',
          l2_visible_groups: form.l2_visible_groups,
          l2_pass_policy: form.l2_pass_policy,
          l2_strictness: form.l2_strictness
        })
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j?.ok) {
        alert(j?.error || 'Kaydedilemedi')
        return
      }
      alert('Ayarlar kaydedildi.')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">GPT Ön Kontrol Ayarları</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Dil:</label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as 'tr'|'en')}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="tr">Türkçe (TR)</option>
            <option value="en">English (EN)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Yükleniyor…</div>
      ) : form ? (
        <div className="space-y-6">
          {/* Eşikler */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Anlamlılık Eşiği</label>
              <input
                type="number" min="0" max="1" step="0.01"
                value={form.meaningful_confidence_min}
                onChange={(e) => setForm({ ...form, meaningful_confidence_min: Number(e.target.value) })}
                className="w-full border rounded px-2 py-1 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">0–1 (örn. 0.70 önerilen)</p>
            </div>
            <div>
              <label className="block text-sm font-medium">Gümrük Kapsamı Eşiği</label>
              <input
                type="number" min="0" max="1" step="0.01"
                value={form.customs_related_confidence_min}
                onChange={(e) => setForm({ ...form, customs_related_confidence_min: Number(e.target.value) })}
                className="w-full border rounded px-2 py-1 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">0–1 (örn. 0.70 önerilen)</p>
            </div>
          </div>

          {/* L2 Prompt */}
          <div>
            <label className="block text-sm font-medium">L2 Prompt (Serbest Değerlendirme)</label>
            <textarea
              value={form.l2_prompt ?? ''}
              onChange={(e) => setForm({ ...form, l2_prompt: e.target.value })}
              placeholder="(Boş bırakılırsa varsayılan TR/EN prompt kullanılır)"
              className="w-full border rounded px-2 py-2 text-sm min-h-[180px] font-mono"
            />
            <p className="text-xs text-gray-500 mt-1">
              Uzmanın eksik bilgi/belgeleri serbestçe değerlendirmesi için yönerge.
            </p>
          </div>

          {/* L2 Görünür Gruplar */}
          <div className="border rounded p-3">
            <div className="font-medium mb-2">L2 Görünür Gruplar</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.l2_visible_groups?.required}
                  onChange={(e) => setForm({
                    ...form,
                    l2_visible_groups: {
                      ...(form.l2_visible_groups || { required: true, should: true, info: true }),
                      required: e.target.checked
                    }
                  })}
                />
                Zorunlu (required)
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.l2_visible_groups?.should}
                  onChange={(e) => setForm({
                    ...form,
                    l2_visible_groups: {
                      ...(form.l2_visible_groups || { required: true, should: true, info: true }),
                      should: e.target.checked
                    }
                  })}
                />
                Olmalı / Önerilir (should)
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.l2_visible_groups?.info}
                  onChange={(e) => setForm({
                    ...form,
                    l2_visible_groups: {
                      ...(form.l2_visible_groups || { required: true, should: true, info: true }),
                      info: e.target.checked
                    }
                  })}
                />
                Bilgilendir (info)
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              İşaretli gruplar kullanıcıya gösterilecektir.
            </p>
          </div>

          {/* L2 Geçme Politikası */}
          <div className="border rounded p-3 space-y-3">
            <div className="font-medium">L2 Geçme Politikası</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="passmode"
                  value="required_only"
                  checked={(form.l2_pass_policy?.mode ?? 'required_only') === 'required_only'}
                  onChange={() => setForm({
                    ...form,
                    l2_pass_policy: { mode: 'required_only', should_max: 0 }
                  })}
                />
                Yalnızca <b>Zorunlu</b> eksik yoksa (0 adet) geçsin.
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="passmode"
                  value="required_and_should"
                  checked={(form.l2_pass_policy?.mode ?? 'required_only') === 'required_and_should'}
                  onChange={() => setForm({
                    ...form,
                    l2_pass_policy: { mode: 'required_and_should', should_max: Math.max(0, form.l2_pass_policy?.should_max ?? 0) }
                  })}
                />
                <span>
                  <b>Zorunlu</b> eksik 0 ve <b>Olmalı</b> eksik en fazla
                  {' '}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={Math.max(0, Math.floor(form.l2_pass_policy?.should_max ?? 0))}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      const v = Number.isNaN(n) ? 0 : Math.max(0, Math.floor(n))
                      setForm({
                        ...form,
                        l2_pass_policy: {
                          mode: 'required_and_should',
                          should_max: v
                        }
                      })
                    }}
                    className="w-20 border rounded px-2 py-0.5 text-sm inline-block text-center"
                    disabled={(form.l2_pass_policy?.mode ?? 'required_only') !== 'required_and_should'}
                  /> adet ise geçsin.
                </span>
              </label>
            </div>
          </div>

          {/* L2 Sıkılık */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">L2 Sıkılık</label>
              <input
                type="number" min="0" max="5" step="1"
                value={typeof form.l2_strictness === 'number' ? form.l2_strictness : 1}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  const v = Number.isNaN(n) ? 1 : Math.max(0, Math.min(5, Math.floor(n)))
                  setForm({ ...form, l2_strictness: v })
                }}
                className="w-full border rounded px-2 py-1 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">0 = Kapalı, 1 = Mevcut davranış, 2 = Çoğu “should” → “required”, 3 = Tüm “should” → “required”.</p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm rounded bg-black text-white hover:opacity-90 disabled:opacity-60"
            >
              Kaydet
            </button>
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500">Kayıt bulunamadı.</div>
      )}
    </div>
  )
}
