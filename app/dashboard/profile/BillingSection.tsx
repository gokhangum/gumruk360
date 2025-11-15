"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
type BillingRow = {
  is_corporate: boolean | null;
  full_name: string | null;
  company_name: string | null;
  tax_number: string | null;
  tax_office: string | null;
  address_line: string | null;
  city: string | null;
  country: string | null;
  phone_dial_code: string | null; // NEW: +90, +49, ...
  phone: string | null;           // local - 10 digits
  e_invoice: boolean | null;
};

const TR_CITIES = [
  "Adana","Adıyaman","Afyonkarahisar","Ağrı","Aksaray","Amasya","Ankara","Antalya","Ardahan","Artvin","Aydın",
  "Balıkesir","Bartın","Batman","Bayburt","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale",
  "Çankırı","Çorum","Denizli","Diyarbakır","Düzce","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir",
  "Gaziantep","Giresun","Gümüşhane","Hakkâri","Hatay","Iğdır","Isparta","İstanbul","İzmir","Kahramanmaraş",
  "Karabük","Karaman","Kars","Kastamonu","Kayseri","Kırıkkale","Kırklareli","Kırşehir","Kilis","Kocaeli",
  "Konya","Kütahya","Malatya","Manisa","Mardin","Mersin","Muğla","Muş","Nevşehir","Niğde","Ordu","Osmaniye",
  "Rize","Sakarya","Samsun","Siirt","Sinop","Sivas","Şanlıurfa","Şırnak","Tekirdağ","Tokat","Trabzon",
  "Tunceli","Uşak","Van","Yalova","Yozgat","Zonguldak"
];

function onlyDigits(s: string){ return s.replace(/\\D+/g, ""); }

function getDialCode(country?: string){
  const c = (country||"").toLowerCase();
  if (c.includes("türk") || c==="tr" || c==="turkiye") return "+90";
  if (c.includes("almanya") || c==="de" || c==="germany") return "+49";
  if (c.includes("birleşik krallık") || c==="uk" || c==="united kingdom" || c==="gb") return "+44";
  if (c==="abd" || c==="usa" || c==="united states") return "+1";
  if (c.includes("fransa") || c==="fr") return "+33";
  if (c.includes("italya") || c==="it") return "+39";
  return "+";
}

export default function BillingSection() {
	const t = useTranslations("profile.billing");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{type:"ok"|"error", text:string} | null>(null);

  const [data, setData] = useState<BillingRow>({
    is_corporate: null,
    full_name: null,
    company_name: null,
    tax_number: null,
    tax_office: null,
    address_line: null,
    city: null,
    country: "Türkiye",
    phone_dial_code: "+90",
    phone: null,
    e_invoice: null
  });

  const [touchedPhone, setTouchedPhone] = useState(false);
  const [touchedTckn, setTouchedTckn] = useState(false);

  const isTR = (data.country ?? "") === "Türkiye";
  const isCorporate = !!data.is_corporate;

  const errors = useMemo(() => {
    const e: Record<string,string> = {};
    const ph = data.phone || "";
    if (ph) {
      const d = onlyDigits(ph);
      if (d.length !== 10) e.phone = t("errors.phoneTenDigits");
    }
    if (!isCorporate) {
      const tn = data.tax_number || "";
     if (tn) {
        const d = onlyDigits(tn);
        if (d.length !== 11) e.tax_number = t("errors.tcknElevenDigits");
      }
    }
    return e;
  }, [data.phone, data.tax_number, isCorporate]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/settings/profile/billing", { method:"GET" });
        const json = await res.json();
        if (!alive) return;
        if (json?.ok) {
          const d = json.data as Partial<BillingRow> | null;
          if (d) {
            setData(prev => ({
              ...prev,
              ...d,
              phone_dial_code: d.phone_dial_code ?? getDialCode(d.country ?? prev.country ?? "Türkiye") ?? "+90"
            }));
          }
        }
      } catch {}
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (data.phone && onlyDigits(data.phone).length !== 10) {
      setTouchedPhone(true);
      setMsg({ type:"error", text: t("errors.phoneTenDigits") });
      return;
    }
    if (!isCorporate && data.tax_number && onlyDigits(data.tax_number).length !== 11) {
      setTouchedTckn(true);
      setMsg({ type:"error", text: t("errors.tcknElevenDigits") });
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/settings/profile/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json?.ok) {
        const d = json.data as Partial<BillingRow>;
        setData(prev => ({ ...prev, ...d }));
        setMsg({ type:"ok", text: t("saved") });
      } else {
        setMsg({ type:"error", text: json?.detail || t("saveFailed") });
      }
    } catch (e: any) {
      setMsg({ type:"error", text: String(e?.message ?? e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8">
	   
	<div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 mb-4 flex items-center gap-3">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
 </div>   
      {loading ? <p className="mt-2 text-sm text-gray-500">{t("loading")}</p> : (
        <form onSubmit={onSubmit} className="mt-4 space-y-4 max-w-2xl">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!data.is_corporate}
              onChange={(e) => setData(s => ({ ...s, is_corporate: e.target.checked }))}
            />
            <span>{t("isCorporate")}</span>
          </label>

          {!isCorporate ? (
            <div className="grid grid-cols-1 gap-4">
              <label className="space-y-1">
                <div className="text-sm text-gray-600">{t("fullName")}</div>
                <input
                  className="input w-full"
                  value={data.full_name || ""}
                  onChange={(e)=> setData(s=>({ ...s, full_name: e.target.value }))}
                  placeholder={t("fullName")}
                  required
                />
              </label>

              <label className="space-y-1">
                <div className="text-sm text-gray-600">{t("tcknLabel")}</div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  className="input w-full"
                  value={data.tax_number || ""}
                  onChange={(e)=> setData(s=>({ ...s, tax_number: onlyDigits(e.target.value).slice(0,11) }))}
                  onBlur={()=> setTouchedTckn(true)}
                  placeholder={t("tcknPlaceholder")}
                />
                {(touchedTckn && errors.tax_number) ? (
                  <p className="text-xs text-red-600 mt-1">{errors.tax_number}</p>
                ) : null}
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1 md:col-span-2">
                <div className="text-sm text-gray-600">{t("companyName")}</div>
                <input
                  className="input w-full"
                  value={data.company_name || ""}
                  onChange={(e)=> setData(s=>({ ...s, company_name: e.target.value }))}
                  placeholder={t("companyName")}
                  required
                />
              </label>
              <label className="space-y-1">
                <div className="text-sm text-gray-600">{t("taxOffice")}</div>
                <input
                  className="input w-full"
                  value={data.tax_office || ""}
                  onChange={(e)=> setData(s=>({ ...s, tax_office: e.target.value }))}
                  placeholder={t("taxOffice")}
                />
              </label>
              <label className="space-y-1">
                <div className="text-sm text-gray-600">{t("vknLabel")}</div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={15}
                  className="input w-full"
                  value={data.tax_number || ""}
                  onChange={(e)=> setData(s=>({ ...s, tax_number: onlyDigits(e.target.value).slice(0,15) }))}
                  placeholder={t("vknPlaceholder")}
                />
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <div className="text-sm text-gray-600">{t("country")}</div>
             <select
              className="input w-full"
                value={data.country || ""}
               onChange={(e)=> setData(s=>({
                 ...s,
                  country: e.target.value,
                  phone_dial_code: s.phone_dial_code || getDialCode(e.target.value)
                }))}
              >
                <option value="Türkiye">{t("countries.TR")}</option>
                <option value="Almanya">{t("countries.DE")}</option>
                <option value="Birleşik Krallık">{t("countries.UK")}</option>
                <option value="ABD">{t("countries.US")}</option>
                <option value="Fransa">{t("countries.FR")}</option>
                <option value="İtalya">{t("countries.IT")}</option>
                <option value="Diğer">{t("otherCountry")}</option>
             </select>
            </label>

            <label className="space-y-1">
              <div className="text-sm text-gray-600">{t("city")}</div>
              {isTR ? (
                <select
                  className="input w-full"
                  value={data.city || ""}
                  onChange={(e)=> setData(s=>({ ...s, city: e.target.value }))}
                >
                  <option value="">{t("select")}</option>
                  {TR_CITIES.map((c)=> <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <input
                  className="input w-full"
                  value={data.city || ""}
                  onChange={(e)=> setData(s=>({ ...s, city: e.target.value }))}
                  placeholder={t("cityPlaceholder")}
                />
              )}
            </label>
          </div>

          <label className="space-y-1">
            <div className="text-sm text-gray-600">{t("address")}</div>
            <textarea
              className="w-full border rounded p-2"
              rows={3}
              value={data.address_line || ""}
              onChange={(e)=> setData(s=>({ ...s, address_line: e.target.value }))}
              placeholder={t("addressPlaceholder")}
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <div className="text-sm text-gray-600">Telefon</div>
              <div className="flex">
                <select
  className="input w-28 rounded-none rounded-l bg-gray-50 text-gray-700"
  value={data.phone_dial_code || "+90"}
  onChange={(e)=> setData(s=>({ ...s, phone_dial_code: e.target.value }))}
>
                  <option value="+90">+90 (TR)</option>
                  <option value="+49">+49 (DE)</option>
                  <option value="+44">+44 (UK)</option>
                  <option value="+1">+1 (US)</option>
                  <option value="+33">+33 (FR)</option>
                  <option value="+39">+39 (IT)</option>
                  <option value="+">{t("otherDial")}</option>
                </select>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="5305303030"
                  className="input w-full rounded-none rounded-r"
                  value={data.phone || ""}
                  onChange={(e)=> setData(s=>({ ...s, phone: onlyDigits(e.target.value).slice(0,10) }))}
                  onBlur={()=> setTouchedPhone(true)}
                />
              </div>
              {(touchedPhone && errors.phone) ? (
                <p className="text-xs text-red-600 mt-1">{errors.phone}</p>
              ) : null}
            </label>

            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 w-full">
                <input
                  type="checkbox"
                  checked={!!data.e_invoice}
                  onChange={(e)=> setData(s=>({ ...s, e_invoice: e.target.checked }))}
                />
                <span>{t("eInvoice")}</span>
              </label>
            </div>
          </div>

          {msg && (
            <p className={"text-sm mt-1 " + (msg.type === "ok" ? "text-green-600" : "text-red-600")}>
              {msg.text}
            </p>
          )}

          <div className="pt-2">
                <Button type="submit" variant="primary" disabled={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
          </div>
        </form>
      )}
    </section>
  );
}
