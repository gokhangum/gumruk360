'use client';

import React, { useEffect, useMemo, useState } from 'react';

/** ====== Types ====== */
type Criterion = {
  id?: string;           // view-id gelmeyebilir
  key?: string;          // UI'da gösterilmiyor
  title_tr: string;
  title_en: string;
  description_tr: string | null;
  description_en: string | null;
  is_optional: boolean;
  order_index: number;
  weight: number;        // ham ağırlık (normalize ayrıca hesapta)
  norm_weight?: number;  // API’den gelebilir
  enabled: boolean;
};

type ProgressiveBand = { range: string; factor: number };

type OptionalExtra = {
  id?: string;
  enabled: boolean;
  title_tr: string;
  title_en: string;
  explanation: string;
  weightMax: number;
};

type ExtConfig = {
  pointsPerHour: number; // 10 puan = 1 saat
  term: { hoursPerDay: number; urgentFactor: number }; // 1 gün = .. saat; acil termin faktörü
  progressive_bands: ProgressiveBand[];
  optionals: {
    gtip: { enabled: boolean; explanation: string; perAltGtip: number; maxBonus: number; baseIfPresent: number; maxBase: number };
    legal: { enabled: boolean; explanation: string; weightMax: number };
    language: { enabled: boolean; explanation: string; weightMax: number };      // yabancı dil
    language_gap: { enabled: boolean; explanation: string; weightMax: number };  // dil farkı (ratio)
  };
  optionals_extra?: OptionalExtra[]; // ✅ ek opsiyoneller
};

type ActiveVersion = {
  id: string;
  version_name: string;
  notes: string | null;
  is_active: boolean;
  base_hourly_rate: number;
  min_price: number;
  urgent_multiplier: number;
  rounding_step: number;
  auto_price_threshold: number | null;
  created_at: string;
};

type ActiveConfigResponse = {
  version: ActiveVersion;
  criteria: Criterion[];
  extConfig: ExtConfig;
};

type EstimateResponse = {
  ok: boolean;
  details: {
    S_base: number;
    f: number;
    S_eff: number;
    S_lang: number;
    S_opt_nonlang: number;
    S_final: number;
    hours: number;
    price_normal: number;
    price_urgent: number;
    min_price: number;
    hourly: number;
    rounding_step: number;
    urgent_multiplier: number;
    normal_days: number;
    urgent_days: number;
    perCriterion: Array<{ title: string; weight_pct: number; score0_10: number; contribution: number }>;
    optionals: any;
    attachments_meta?: Array<{name:string;size:number;type:string}>;
  };
  price_final: number;
};

type VersionsList = { items: Array<ActiveVersion> };

/** ====== Utils ====== */
function pct(n: number) { return Math.round(n * 100) / 100; }
 function useLang(): 'tr' | 'en' {
   if (typeof window === 'undefined') return 'tr';
   const h = window.location.hostname.toLowerCase();
   if ((/(^|\.)tr\.easycustoms360\.com$/i).test(h)) return 'en';
   return 'tr';
 }

/** ====== Page ====== */
export default function GPTModulePage() {
  const [tab, setTab] = useState<'config' | 'versions' | 'sample'>('config');

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-3">GPT Modülü</h1>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setTab('config')} className={`px-3 py-2 rounded ${tab==='config'?'bg-black text-white':'bg-gray-200'}`}>Kriter & Değişkenler</button>
        <button onClick={() => setTab('versions')} className={`px-3 py-2 rounded ${tab==='versions'?'bg-black text-white':'bg-gray-200'}`}>Versiyonlar</button>
        <button onClick={() => setTab('sample')} className={`px-3 py-2 rounded ${tab==='sample'?'bg-black text-white':'bg-gray-200'}`}>Örnek Hesap</button>
      </div>

      {tab === 'config' && <ConfigTab />}
      {tab === 'versions' && <VersionsTab />}
      {tab === 'sample' && <SampleCalcTab />}
    </div>
  );
}

/** ====== Config Tab ====== */
function ConfigTab() {
  const [loading, setLoading] = useState(true);
  const [ver, setVer] = useState<ActiveVersion | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [extConfig, setExtConfig] = useState<ExtConfig | null>(null);
  const [versionName, setVersionName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch('/api/admin/gpt-pricing/config');
      const data: ActiveConfigResponse = await res.json();
      setVer(data.version);
      setCriteria(data.criteria);
      setExtConfig({
        ...data.extConfig,
        optionals_extra: data.extConfig.optionals_extra ?? []
      });
      setVersionName(`${data.version.version_name}-copy`);
      setLoading(false);
    })();
  }, []);

  const totalWeightEnabled = useMemo(
    () => criteria.reduce((s, c) => s + (c.enabled ? c.weight : 0), 0),
    [criteria]
  );

  const normalized = useMemo(() => criteria.map(c => ({
    ...c,
    weight_pct: totalWeightEnabled > 0 && c.enabled ? (c.weight / totalWeightEnabled) * 100 : 0
  })), [criteria, totalWeightEnabled]);

  function updateCriterion(idOrKey: string | undefined, patch: Partial<Criterion>) {
    setCriteria(prev => prev.map(c => (c.id === idOrKey || c.key === idOrKey) ? { ...c, ...patch } : c));
  }

  // Ağırlık değiştiğinde toplamı 100'de tutmak için diğer aktif kriterleri ölçekle
  function setWeightWithNormalize(idOrKey: string | undefined, newWeight: number) {
    setCriteria(prev => {
      const idx = prev.findIndex(c => c.id === idOrKey || c.key === idOrKey);
      if (idx === -1) return prev;
      const target = prev[idx];
      const others = prev.filter((c, i) => i !== idx && c.enabled);
      const sumOthers = others.reduce((s, c) => s + c.weight, 0);
      const scaled: Criterion[] = prev.map(c => ({ ...c }));
      scaled[idx].weight = newWeight;

      if (sumOthers > 0) {
        const factor = (100 - newWeight) / sumOthers;
        for (let i = 0; i < scaled.length; i++) {
          if (i === idx || !scaled[i].enabled) continue;
          scaled[i].weight = Math.max(0, Math.round(scaled[i].weight * factor * 100) / 100);
        }
      }
      return scaled;
    });
  }

  function addCriterionRow(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const nid = `new-${Math.random().toString(36).slice(2)}`;
    setCriteria(prev => ([
      ...prev,
      {
        id: nid,              // UI içi geçici id
        // key GÖNDERİLMİYOR: sunucu benzersiz key üretecek
        title_tr: '',
        title_en: '',
        description_tr: '',
        description_en: '',
        is_optional: false,
        order_index: prev.length + 1,
        weight: 0,
        enabled: false
      } as any
    ]));
  }

  /** ----- Opsiyoneller (extra) ----- */
  function addOptionalExtra() {
    if (!extConfig) return;
    const list = [...(extConfig.optionals_extra ?? [])];
    list.push({
      enabled: true,
      title_tr: '',
      title_en: '',
      explanation: '',
      weightMax: 5
    });
    setExtConfig({ ...extConfig, optionals_extra: list });
  }
  function updateOptionalExtra(idx: number, patch: Partial<OptionalExtra>) {
    if (!extConfig) return;
    const list = [...(extConfig.optionals_extra ?? [])];
    list[idx] = { ...list[idx], ...patch };
    setExtConfig({ ...extConfig, optionals_extra: list });
  }
  function removeOptionalExtra(idx: number) {
    if (!extConfig) return;
    const list = [...(extConfig.optionals_extra ?? [])];
    list.splice(idx, 1);
    setExtConfig({ ...extConfig, optionals_extra: list });
  }

  async function saveAsNewVersion() {
    if (!ver || !extConfig) return;
    if (!versionName.trim()) {
      alert('Lütfen versiyon adı girin.');
      return;
    }
    const body = {
      versionName,
      notes,
      base_hourly_rate: ver.base_hourly_rate,
      min_price: ver.min_price,
      urgent_multiplier: ver.urgent_multiplier,
      rounding_step: ver.rounding_step,
      auto_price_threshold: ver.auto_price_threshold,
      criteria,
      extConfig
    };
    const res = await fetch('/api/admin/gpt-pricing/config', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const t = await res.text();
      alert('Kaydetme hatası: ' + t);
      return;
    }
    alert('Yeni versiyon kaydedildi ve aktifleştirildi.');
    location.reload();
  }

  if (loading || !ver || !extConfig) return <div>Yükleniyor…</div>;

  const langIsTr = useLang()==='tr';

  return (
    <div className="space-y-6">
      {/* GENEL DEĞİŞKENLER */}
      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Genel Değişkenler</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <LabeledNumber label="Saatlik Ücret (TL)" value={ver.base_hourly_rate} onChange={v => setVer({ ...ver, base_hourly_rate: v })}/>
          <LabeledNumber label="Min Ücret (TL)" value={ver.min_price} onChange={v => setVer({ ...ver, min_price: v })}/>
          <LabeledNumber label="Acil Fiyat Çarpanı" step={0.1} value={ver.urgent_multiplier} onChange={v => setVer({ ...ver, urgent_multiplier: v })}/>
          <LabeledNumber label="Yuvarlama Adımı (TL)" value={ver.rounding_step} onChange={v => setVer({ ...ver, rounding_step: v })}/>
          <LabeledNumber label="Points per Hour" value={extConfig.pointsPerHour} onChange={v => setExtConfig({ ...extConfig, pointsPerHour: v })}/>
          <div className="grid grid-cols-2 gap-3">
            <LabeledNumber label="1 Gün = ... Saat (Termin)" value={extConfig.term.hoursPerDay} onChange={v => setExtConfig({ ...extConfig, term: { ...extConfig.term, hoursPerDay: v } })}/>
            <LabeledNumber label="Acil Termin Faktörü" step={0.05} value={extConfig.term.urgentFactor} onChange={v => setExtConfig({ ...extConfig, term: { ...extConfig.term, urgentFactor: v } })}/>
          </div>
        </div>
      </section>

      {/* KRİTERLER */}
      <section className="border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">Kriterler (Toplam: {pct(totalWeightEnabled)})</h2>
          <button type="button" className="px-3 py-2 bg-gray-800 text-white rounded-lg" onClick={addCriterionRow}>Kriter Ekle</button>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[760px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="p-2">Aktif</th>
                <th className="p-2">{langIsTr ? 'Başlık (TR)' : 'Title (EN)'}</th>
                <th className="p-2" style={{minWidth: 320}}>{langIsTr ? 'Puanlama Talimatları (TR)' : 'Scoring Notes (EN)'}</th>
                <th className="p-2">Ağırlık</th>
                <th className="p-2">% (normalize)</th>
              </tr>
            </thead>
            <tbody>
              {normalized
                .sort((a,b)=>a.order_index-b.order_index)
                .map((c, idx) => (
                <tr key={c.key || c.id || idx} className="border-b align-top">
                  <td className="p-2">
                    <input type="checkbox" checked={c.enabled} onChange={e => updateCriterion(c.id ?? c.key, { enabled: e.target.checked })}/>
                  </td>
                  <td className="p-2">
                    <input className="border p-1 rounded w-72 max-w-[72ch]" value={langIsTr ? c.title_tr : c.title_en}
                      onChange={e => updateCriterion(c.id ?? c.key, langIsTr ? { title_tr: e.target.value } : { title_en: e.target.value })}/>
                  </td>
                  <td className="p-2">
                    <textarea className="border p-1 rounded w-[40rem] max-w-full" rows={3}
                      value={langIsTr ? (c.description_tr ?? '') : (c.description_en ?? '')}
                      onChange={e => updateCriterion(c.id ?? c.key, langIsTr ? { description_tr: e.target.value } : { description_en: e.target.value })}/>
                  </td>
                  <td className="p-2">
                    <input type="number" className="border p-1 rounded w-24"
                      value={c.weight}
                      onChange={e => setWeightWithNormalize(c.id ?? c.key, Number(e.target.value))}/>
                  </td>
                  <td className="p-2">{pct((c as any).weight_pct)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-600">
          Not: Ağırlıklar <b>100’e otomatik ölçeklenir</b>. Yeni kriterler <b>pasif</b> eklenir.
        </p>
      </section>

      {/* OPSİYONELLER + PROGRESSIVE */}
      <section className="border rounded-xl p-4 space-y-6">
        <h2 className="text-lg font-semibold">Opsiyoneller & Progressive</h2>
        <div className="grid lg:grid-cols-2 gap-4">
          {/* GTIP BONUS */}
          <Card title="GTİP Bonus">
            <Toggle label="Aktif" checked={extConfig.optionals.gtip.enabled}
              onChange={(checked)=> setExtConfig({...extConfig, optionals:{...extConfig.optionals, gtip:{...extConfig.optionals.gtip, enabled:checked}}})}/>
            <LabeledTextarea label="Açıklama" value={extConfig.optionals.gtip.explanation}
              onChange={v => setExtConfig({...extConfig, optionals:{...extConfig.optionals, gtip:{...extConfig.optionals.gtip, explanation:v}}})}/>
            <div className="grid grid-cols-2 gap-3">
              <LabeledNumber label="Alt GTİP Başına Bonus" step={0.1} value={extConfig.optionals.gtip.perAltGtip}
                onChange={v => setExtConfig({...extConfig, optionals:{...extConfig.optionals, gtip:{...extConfig.optionals.gtip, perAltGtip:v}}})}/>
              <LabeledNumber label="Maks Bonus" step={0.1} value={extConfig.optionals.gtip.maxBonus}
                onChange={v => setExtConfig({...extConfig, optionals:{...extConfig.optionals, gtip:{...extConfig.optionals.gtip, maxBonus:v}}})}/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <LabeledNumber label="(S_base) GTİP Varsa Taban" step={1} value={extConfig.optionals.gtip.baseIfPresent}
                onChange={v => setExtConfig({...extConfig, optionals:{...extConfig.optionals, gtip:{...extConfig.optionals.gtip, baseIfPresent:v}}})}/>
              <LabeledNumber label="(S_base) GTİP Maks" step={1} value={extConfig.optionals.gtip.maxBase}
                onChange={v => setExtConfig({...extConfig, optionals:{...extConfig.optionals, gtip:{...extConfig.optionals.gtip, maxBase:v}}})}/>
            </div>
          </Card>

          {/* LEGAL */}
          <Card title="Hukuki Süreç">
            <Toggle label="Aktif" checked={extConfig.optionals.legal.enabled}
              onChange={(checked)=> setExtConfig({...extConfig, optionals:{...extConfig.optionals, legal:{...extConfig.optionals.legal, enabled:checked}}})}/>
            <LabeledTextarea label="Açıklama" value={extConfig.optionals.legal.explanation}
              onChange={v => setExtConfig({...extConfig, optionals:{...extConfig.optionals, legal:{...extConfig.optionals.legal, explanation:v}}})}/>
            <LabeledNumber label="Max Puan" step={1} value={extConfig.optionals.legal.weightMax}
              onChange={v => setExtConfig({...extConfig, optionals:{...extConfig.optionals, legal:{...extConfig.optionals.legal, weightMax:v}}})}/>
          </Card>

          {/* LANGUAGE */}
          <Card title="Dil (Yabancı dil/Çeviri)">
            <Toggle label="Aktif" checked={extConfig.optionals.language.enabled}
              onChange={(checked)=> setExtConfig({...extConfig, optionals:{...extConfig.optionals, language:{...extConfig.optionals.language, enabled:checked}}})}/>
            <LabeledTextarea label="Açıklama" value={extConfig.optionals.language.explanation}
              onChange={v => setExtConfig({...extConfig, optionals:{...extConfig.optionals, language:{...extConfig.optionals.language, explanation:v}}})}/>
            <LabeledNumber label="Max Puan" step={1} value={extConfig.optionals.language.weightMax}
              onChange={v => setExtConfig({...extConfig, optionals:{...extConfig.optionals, language:{...extConfig.optionals.language, weightMax:v}}})}/>
          </Card>

          {/* LANGUAGE GAP */}
          <Card title="Dil Farkı (Ratio formülü)">
            <Toggle label="Aktif" checked={extConfig.optionals.language_gap.enabled}
              onChange={(checked)=> setExtConfig({...extConfig, optionals:{...extConfig.optionals, language_gap:{...extConfig.optionals.language_gap, enabled:checked}}})}/>
            <LabeledTextarea label="Açıklama" value={extConfig.optionals.language_gap.explanation}
              onChange={v => setExtConfig({...extConfig, optionals:{...extConfig.optionals, language_gap:{...extConfig.optionals.language_gap, explanation:v}}})}/>
            <LabeledNumber label="Max Puan (langWeightMax)" step={1} value={extConfig.optionals.language_gap.weightMax}
              onChange={v => setExtConfig({...extConfig, optionals:{...extConfig.optionals, language_gap:{...extConfig.optionals.language_gap, weightMax:v}}})}/>
          </Card>
        </div>

        {/* ✅ OPSİYONEL EKLE (extra) */}
        <div className="border rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Ek Opsiyoneller</h3>
            <button type="button" className="px-3 py-2 bg-gray-800 text-white rounded-lg" onClick={addOptionalExtra}>Opsiyonel Ekle</button>
          </div>
          <div className="space-y-3">
            {(extConfig.optionals_extra ?? []).length === 0 && (
              <div className="text-sm text-gray-500">Henüz ek opsiyonel yok.</div>
            )}
            {(extConfig.optionals_extra ?? []).map((o, idx) => (
              <div key={idx} className="border rounded-lg p-3 grid md:grid-cols-2 gap-3">
                <div className="flex items-center gap-3">
                  <Toggle label="Aktif" checked={o.enabled} onChange={v=>updateOptionalExtra(idx, { enabled: v })}/>
                  <button type="button" className="text-red-600 text-sm underline" onClick={()=>removeOptionalExtra(idx)}>Sil</button>
                </div>
                <LabeledNumber label="Max Puan" value={o.weightMax} onChange={v=>updateOptionalExtra(idx, { weightMax: v })}/>
                <LabeledText label={langIsTr ? "Başlık (TR)" : "Title (EN)"} value={langIsTr ? o.title_tr : o.title_en} onChange={v=>updateOptionalExtra(idx, langIsTr ? { title_tr: v } : { title_en: v })}/>
                <LabeledTextarea label={langIsTr ? "Açıklama" : "Explanation"} value={o.explanation} onChange={v=>updateOptionalExtra(idx, { explanation: v })}/>
              </div>
            ))}
          </div>
        </div>

        {/* PROGRESSIVE */}
        <div className="border rounded-xl p-3 space-y-3">
          <h3 className="font-semibold">Progressive Katsayı</h3>
          <div className="overflow-auto">
            <table className="min-w-[420px] text-sm w-full">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Puan Aralığı</th>
                  <th className="p-2">Katsayı</th>
                </tr>
              </thead>
              <tbody>
                {extConfig.progressive_bands.map((row, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="p-2">
                      <input className="border p-1 rounded w-40" value={row.range}
                        onChange={e => {
                          const copy = [...extConfig.progressive_bands];
                          copy[idx] = { ...row, range: e.target.value };
                          setExtConfig({ ...extConfig, progressive_bands: copy });
                        }}/>
                    </td>
                    <td className="p-2">
                      <input type="number" step={0.1} className="border p-1 rounded w-28" value={row.factor}
                        onChange={e => {
                          const copy = [...extConfig.progressive_bands];
                          copy[idx] = { ...row, factor: Number(e.target.value) };
                          setExtConfig({ ...extConfig, progressive_bands: copy });
                        }}/>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-600">Varsayılan: 0-10 → 1.0, 11-20 → 1.2, …, 91-100 → 2.8 (dilediğiniz gibi değiştirin).</p>
        </div>
      </section>

      {/* VERSİYON KAYDET */}
      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold">Versiyon Kaydet</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <LabeledText label="Versiyon Adı" value={versionName} onChange={setVersionName}/>
          <LabeledText label="Notlar (opsiyonel)" value={notes} onChange={setNotes}/>
        </div>
        <button className="px-4 py-2 bg-black text-white rounded-lg" onClick={saveAsNewVersion}>
          Yeni Versiyon Olarak Kaydet & Aktifleştir
        </button>
      </section>
    </div>
  );
}

/** ====== Versions Tab (activate/delete) ====== */
function VersionsTab() {
  const [rows, setRows] = useState<ActiveVersion[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch('/api/admin/gpt-pricing/versions');
    const data: VersionsList = await res.json();
    setRows((data.items || []) as any);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, []);

  async function activate(id: string) {
    const ok = confirm('Bu versiyonu aktifleştirmek istiyor musunuz?');
    if (!ok) return;
    const res = await fetch('/api/admin/gpt-pricing/versions/activate', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ version_id: id })
    });
    if (!res.ok) {
      const t = await res.text();
      alert('Aktifleştirme hatası: ' + t);
      return;
    }
    await load();
    alert('Versiyon aktifleştirildi.');
  }

  async function remove(id: string) {
    const ok = confirm('Bu versiyonu silmek istiyor musunuz? (Aktif versiyon silinemez)');
    if (!ok) return;
    const res = await fetch('/api/admin/gpt-pricing/versions/delete', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ version_id: id })
    });
    if (!res.ok) {
      const t = await res.text();
      alert('Silme hatası: ' + t);
      return;
    }
    await load();
    alert('Versiyon silindi.');
  }

  if (loading) return <div>Yükleniyor…</div>;

  return (
    <div className="border rounded-xl p-4 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-3">Versiyonlar</h2>
      <table className="min-w-[980px] w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="p-2">Aktif</th>
            <th className="p-2">Ad</th>
            <th className="p-2">Oluşturulma</th>
            <th className="p-2">Saatlik</th>
            <th className="p-2">Min Ücret</th>
            <th className="p-2">Acil</th>
            <th className="p-2">Yuvarlama</th>
            <th className="p-2">İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="p-2">{r.is_active ? '✓' : ''}</td>
              <td className="p-2">{r.version_name}</td>
              <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
              <td className="p-2">{r.base_hourly_rate}</td>
              <td className="p-2">{r.min_price}</td>
              <td className="p-2">{r.urgent_multiplier}</td>
              <td className="p-2">{r.rounding_step}</td>
              <td className="p-2 flex gap-2">
                {!r.is_active && (
                  <>
                    <button className="px-2 py-1 rounded bg-blue-600 text-white" onClick={()=>activate(r.id)}>
                      Aktifleştir
                    </button>
                    <button className="px-2 py-1 rounded bg-red-600 text-white" onClick={()=>remove(r.id)}>
                      Sil
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ====== Sample Calc Tab ====== */
function SampleCalcTab() {
  const [question, setQuestion] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [result, setResult] = useState<EstimateResponse | null>(null);
  const [busy, setBusy] = useState(false);

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setAttachments(files);
  }

  async function run() {
    setBusy(true);
    const attachmentsMeta = attachments.map(f => ({ name: f.name, size: f.size, type: f.type }));
    const res = await fetch('/api/admin/gpt-pricing/estimate', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ question, isUrgent, attachmentsMeta })
    });
    const data: EstimateResponse = await res.json();
    setResult(data);
    setBusy(false);
  }

  return (
    <div className="border rounded-xl p-4 space-y-4">
      <h2 className="text-lg font-semibold">Örnek Hesap</h2>
      <textarea className="border rounded-lg p-2 w-full" rows={6}
        placeholder="Buraya örnek bir soru yazın…"
        value={question} onChange={e=>setQuestion(e.target.value)} />
      <div className="flex items-center gap-6 flex-wrap">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={isUrgent} onChange={e=>setIsUrgent(e.target.checked)}/>
          Acil
        </label>

        {/* ✅ Ek dosyalar (sadece değerlendirme için, kaydedilmez) */}
        <label className="inline-flex items-center gap-2">
          <span>Ekler</span>
          <input type="file" multiple onChange={onFiles} />
        </label>

        <button disabled={busy} className="px-3 py-2 bg-black text-white rounded-lg" onClick={run}>
          Ücret Oluştur
        </button>
      </div>

      {attachments.length > 0 && (
        <div className="text-xs text-gray-600">
          {attachments.length} ek seçildi: {attachments.map(f=>f.name).join(', ')}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Kpi label="S_base" value={result.details.S_base}/>
            <Kpi label="f (progressive)" value={result.details.f}/>
            <Kpi label="S_eff" value={result.details.S_eff}/>
            <Kpi label="S_opt_nonlang" value={result.details.S_opt_nonlang}/>
            <Kpi label="S_lang (dil farkı)" value={result.details.S_lang}/>
            <Kpi label="S_final" value={result.details.S_final}/>
            <Kpi label="Saat" value={result.details.hours}/>
            <Kpi label="Termin (gün)" value={result.details.normal_days}/>
            <Kpi label="Acil Termin (gün)" value={result.details.urgent_days}/>
            <Kpi label="Normal Fiyat (TL)" value={result.details.price_normal}/>
            <Kpi label="Acil Fiyat (TL)" value={result.details.price_urgent}/>
          </div>

          <div className="border rounded-lg p-3 overflow-auto">
            <h3 className="font-semibold mb-2">Kriter Puanları</h3>
            <table className="min-w-[720px] w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Kriter</th>
                  <th className="p-2">% Ağırlık</th>
                  <th className="p-2">Skor (0-10)</th>
                  <th className="p-2">Katkı</th>
                </tr>
              </thead>
              <tbody>
                {result.details.perCriterion.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{r.title}</td>
                    <td className="p-2">{pct(r.weight_pct)}%</td>
                    <td className="p-2">{r.score0_10}</td>
                    <td className="p-2">{r.contribution}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border rounded-lg p-3">
            <h3 className="font-semibold mb-2">Opsiyoneller</h3>
            <pre className="text-xs bg-gray-50 p-2 rounded-lg overflow-x-auto">{JSON.stringify(result.details.optionals, null, 2)}</pre>
            {result.details.attachments_meta && (
              <div className="text-xs text-gray-600 mt-2">
                Ekler: {result.details.attachments_meta.map((a:any)=>a.name).join(', ')}
              </div>
            )}
          </div>

          <div className="text-right text-lg font-semibold">
            Sonuç (TL): {result.price_final}
          </div>
        </div>
      )}
    </div>
  );
}

/** ====== small ui helpers ====== */
function LabeledNumber({label, value, onChange, step=1}:{label:string; value:number; onChange:(v:number)=>void; step?:number}) {
  return (
    <label className="text-sm space-y-1 block">
      <div className="font-medium">{label}</div>
      <input type="number" step={step} className="border rounded-lg p-2 w-full"
        value={value} onChange={e => onChange(Number(e.target.value))}/>
    </label>
  );
}
function LabeledText({label, value, onChange}:{label:string; value:string; onChange:(v:string)=>void}) {
  return (
    <label className="text-sm space-y-1 block">
      <div className="font-medium">{label}</div>
      <input className="border rounded-lg p-2 w-full" value={value} onChange={e=>onChange(e.target.value)}/>
    </label>
  );
}
function LabeledTextarea({label, value, onChange}:{label:string; value:string; onChange:(v:string)=>void}) {
  return (
    <label className="text-sm space-y-1 block">
      <div className="font-medium">{label}</div>
      <textarea rows={3} className="border rounded-lg p-2 w-full" value={value} onChange={e=>onChange(e.target.value)}/>
    </label>
  );
}
function Toggle({label, checked, onChange}:{label:string; checked:boolean; onChange:(v:boolean)=>void}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>
      {label}
    </label>
  );
}
function Card({title, children}:{title:string; children:React.ReactNode}) {
  return (
    <div className="border rounded-xl p-3 space-y-3 bg-white">
      <div className="font-semibold">{title}</div>
      {children}
    </div>
  );
}
function Kpi({label, value}:{label:string; value:number|string}) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-gray-600">{label}</div>
      <div className="text-lg font-semibold break-words">{value}</div>
    </div>
  );
}
