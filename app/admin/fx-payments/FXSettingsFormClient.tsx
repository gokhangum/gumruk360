"use client";

import * as React from "react";

type TenantRow = {
  id: string;
  primary_domain: string | null;
  currency: string | null;
  pricing_multiplier: number | null;
};
	const BASE_CURRENCIES = ["TRY", "USD", "EUR", "GBP", "AED"];
export default function FXSettingsForm({
  tenants,
  updateTenantAction
}: {
  tenants: TenantRow[];
  updateTenantAction: (formData: FormData) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = React.useState<string>(tenants[0]?.id ?? "");
  const current = React.useMemo(
    () => tenants.find(t => t.id === selectedId) ?? tenants[0],
    [selectedId, tenants]
  );

  const [currency, setCurrency] = React.useState<string>(current?.currency ?? "TRY");
  const [multiplier, setMultiplier] = React.useState<string>(
    current?.pricing_multiplier != null ? String(current.pricing_multiplier) : "1.00"
  );
    // TCMB gösterimi (sadece ekranda, DB kaydı yok)
  const [tcmbLoading, setTcmbLoading] = React.useState(false);
  const [tcmbRate, setTcmbRate] = React.useState<number | null>(null); // 1 BASE = ? TRY
  const [tcmbAsOf, setTcmbAsOf] = React.useState<string | null>(null);
  const [tcmbErr, setTcmbErr] = React.useState<string | null>(null);
  // 10000 TL test sonucu (sadece gösterim)
  const [testLoading, setTestLoading] = React.useState(false);
  const [testResult, setTestResult] = React.useState<string | null>(null);
  const [testErr, setTestErr] = React.useState<string | null>(null);

  const currencyOptions = React.useMemo(() => {
  const cur = (currency ?? "TRY").toUpperCase();
  return BASE_CURRENCIES.includes(cur)
    ? BASE_CURRENCIES
    : [cur, ...BASE_CURRENCIES.filter(c => c !== cur)];
}, [currency]);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    setCurrency((current?.currency ?? "TRY").toUpperCase());
    setMultiplier(
      current?.pricing_multiplier != null ? String(current.pricing_multiplier) : "1.00"
    );
    setMsg(null);
    setErr(null);
  }, [current?.id]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    try {
      await updateTenantAction(fd);
      setMsg("Ayarlar kaydedildi.");
    } catch (e: any) {
      setErr(e?.message ?? "Kayıt sırasında bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  };
const fetchTcmb = async () => {
  try {
    setTcmbLoading(true);
    setTcmbErr(null);
    setTcmbRate(null);
    setTcmbAsOf(null);
    const base = (currency ?? "TRY").toUpperCase();
    const res = await fetch(`/api/fx/tcmb?base=${encodeURIComponent(base)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `HTTP_${res.status}`);
    }
    // 1 BASE = data.rate TRY
    setTcmbRate(Number(data.rate));
    setTcmbAsOf(data.asof || null);
  } catch (e: any) {
    setTcmbErr(e?.message ?? "Kur çekilemedi");
  } finally {
    setTcmbLoading(false);
  }
};
  const runTenThousandTryTest = async () => {
    try {
      setTestLoading(true);
      setTestErr(null);
      setTestResult(null);

      const base = (currency ?? "TRY").toUpperCase(); // seçili domain'in currency'si
      const mult = Number((multiplier || "1").replace(",", "."));
      if (!isFinite(mult) || mult <= 0) {
        throw new Error("Geçersiz multiplier");
      }

      // 1 BASE = rate TRY
      let rate = tcmbRate;
      if (base === "TRY") {
        rate = 1;
      }
      // Kur yoksa şimdi çek
      if (!rate) {
        const res = await fetch(`/api/fx/tcmb?base=${encodeURIComponent(base)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || `HTTP_${res.status}`);
        }
        rate = Number(data.rate);
      }
      if (!rate || !isFinite(rate) || rate <= 0) {
        throw new Error("Kur bilgisi alınamadı");
      }

      // Formül: (10000 TL / (BASE→TRY kuru)) * pricing_multiplier  => BASE cinsinden
      const priceTry = 10000;
      const amountBase = priceTry / rate;
      const result = amountBase * mult;

      setTestResult(`${result.toFixed(2)} ${base}`);
    } catch (e: any) {
      setTestErr(e?.message ?? "Test hesaplanamadı");
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Domain/tenant seçimi */}
      <div className="grid grid-cols-1 gap-2">
        <label className="text-sm font-medium">Domain (Tenant)</label>
        <select
          name="tenantId"
          className="border rounded-md px-3 py-2"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {tenants.map(t => (
            <option key={t.id} value={t.id}>
              {t.primary_domain ?? "(no-domain)"} — {t.id}
            </option>
          ))}
        </select>
      </div>

      {/* Currency (editlenebilir) */}
      <div className="grid grid-cols-1 gap-2">
        <label className="text-sm font-medium">Currency</label>
<select
  name="currency"
  className="border rounded-md px-3 py-2"
  value={(currency ?? "TRY").toUpperCase()}
  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
  required
>
  {currencyOptions.map((c) => (
    <option key={c} value={c}>{c}</option>
  ))}
</select>
<p className="text-xs text-gray-500">
  Tenant'ın para birimi. Ana desteklenenler: {`TRY, USD, EUR, GBP, AED`}
</p>
      </div>

      {/* Multiplier (editlenebilir) */}
      <div className="grid grid-cols-1 gap-2">
        <label className="text-sm font-medium">Payment Multiplier</label>
        <input
          name="pricing_multiplier"
          className="border rounded-md px-3 py-2"
          value={multiplier}
          onChange={(e) => setMultiplier(e.target.value)}
          placeholder="Örn: 1.00, 1.15"
          required
        />
        <p className="text-xs text-gray-500">
          0 &lt; multiplier ≤ 100 (numeric(10,4) önerilir). Ekrandaki TL fiyat × multiplier olarak kullanılacak.
        </p>
      </div>
      {/* TCMB BASE/TRY gösterimi (sadece önizleme) */}
      <div className="grid grid-cols-1 gap-2">
              <label className="text-sm font-medium">
          TCMB {(currency ?? "TRY").toUpperCase()}/TRY Kuru
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchTcmb}
            disabled={tcmbLoading}
            className="px-3 py-2 rounded-md border disabled:opacity-60"
          >
            {tcmbLoading ? "Çekiliyor..." : "Kuru Çek"}
          </button>
          <input
            className="border rounded-md px-3 py-2 w-48"
            readOnly
            value={tcmbRate != null ? tcmbRate.toFixed(4) : ""}
            placeholder="—"
         />
          {tcmbAsOf && (
            <span className="text-xs text-gray-500">Tarih: {tcmbAsOf}</span>
          )}
        </div>
        {tcmbErr && <p className="text-xs text-red-600">{tcmbErr}</p>}
        <p className="text-xs text-gray-500">
          * Sadece gösterim içindir; DB'ye kaydedilmez. Kaynak: TCMB today.xml (ForexSelling).
        </p>
      </div>
      {/* 10000 TL test */}
      <div className="grid grid-cols-1 gap-2">
        <label className="text-sm font-medium">10000 TL Test</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={runTenThousandTryTest}
            disabled={testLoading}
            className="px-3 py-2 rounded-md border disabled:opacity-60"
          >
            {testLoading ? "Hesaplanıyor..." : "10000 TL test"}
          </button>
          <input
            className="border rounded-md px-3 py-2 w-56"
            readOnly
            value={testResult ?? ""}
            placeholder="Sonuç (BASE)"
          />
        </div>
        {testErr && <p className="text-xs text-red-600">{testErr}</p>}
        <p className="text-xs text-gray-500">
          * Formül: (10000 TL / { (currency ?? "TRY").toUpperCase() }→TRY kuru) × multiplier = { (currency ?? "BASE").toUpperCase() } cinsinden.
          Sadece önizleme; DB kaydı yapılmaz.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-md bg-black text-white disabled:opacity-60"
        >
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>

        {msg && <span className="text-green-600 text-sm">{msg}</span>}
        {err && <span className="text-red-600 text-sm">{err}</span>}
      </div>
    </form>
  );
}
