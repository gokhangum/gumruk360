// app/admin/seo/AdminSeoForm.tsx
"use client";
import { useMemo, useState, useEffect } from "react";

type Item = { tenant_code: string; host: string; locale: string };
type RecordInit = {
  tenant_code: string; locale: string; route: string;
  title: string | null; description: string | null; keywords: string[] | null;
  og_image_url: string | null; jsonld: any | null; is_active: boolean;
};

type Props = {
  items: Item[];
  defaultTenantCode: string;
  defaultLocale: string;
  formAction: (formData: FormData) => void | Promise<void>;
  initialRecord?: RecordInit | null;
};

export default function AdminSeoForm({ items, defaultTenantCode, defaultLocale, formAction, initialRecord }: Props) {
  const [tenantCode, setTenantCode] = useState(initialRecord?.tenant_code || defaultTenantCode);
  const current = useMemo(() => items.find(i => i.tenant_code === tenantCode) || items[0], [tenantCode, items]);
  const locale = current?.locale || defaultLocale;

  const [defaults, setDefaults] = useState(() => ({
    route: initialRecord?.route || "*",
    title: initialRecord?.title || "",
    description: initialRecord?.description || "",
    keywords: (initialRecord?.keywords || []).join(", "),
    og_image_url: initialRecord?.og_image_url || "",
    jsonld: initialRecord?.jsonld ? JSON.stringify(initialRecord.jsonld) : "",
    is_active: initialRecord?.is_active ?? true,
  }));

  useEffect(() => {
    if (initialRecord) {
      setTenantCode(initialRecord.tenant_code);
      setDefaults({
        route: initialRecord.route || "*",
        title: initialRecord.title || "",
        description: initialRecord.description || "",
        keywords: (initialRecord.keywords || []).join(", "),
        og_image_url: initialRecord.og_image_url || "",
        jsonld: initialRecord.jsonld ? JSON.stringify(initialRecord.jsonld) : "",
        is_active: initialRecord.is_active ?? true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecord?.tenant_code, initialRecord?.locale, initialRecord?.route]);

  if (!items || items.length === 0) {
    return <div className="text-sm text-red-600">Tenant/host bulunamadı.</div>;
  }

  return (
    <form action={formAction as any} className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="md:col-span-2">
        <label className="block text-sm mb-1">Tenant (host bazlı)</label>
        <select
          name="tenant_code"
          value={tenantCode}
          onChange={(e)=>setTenantCode(e.target.value)}
          className="w-full border rounded px-3 py-2"
        >
          {items.map((i) => (
            <option key={`${i.tenant_code}:${i.host}`} value={i.tenant_code}>
              {i.host} — {i.tenant_code}
            </option>
          ))}
        </select>
      </div>

      {/* locale UI yok; action için gizli gönder */}
      <input type="hidden" name="locale" value={locale} />

      <div className="md:col-span-2">
        <label className="block text-sm mb-1">Route</label>
        <input name="route" defaultValue={defaults.route} className="w-full border rounded px-3 py-2" placeholder="*, /, /about, /how-it-works, /blog, /blog/[slug]" />
      </div>
      <div className="md:col-span-2">
        <label className="block text-sm mb-1">Title</label>
        <input name="title" defaultValue={defaults.title} className="w-full border rounded px-3 py-2" placeholder="Gümrük360 – Türkiye Gümrük Mevzuatı, GTİP ve Uygulamalar" />
      </div>
      <div className="md:col-span-2">
        <label className="block text-sm mb-1">Description</label>
        <textarea name="description" rows={3} defaultValue={defaults.description} className="w-full border rounded px-3 py-2" placeholder="Türk gümrük mevzuatı, 4458 sayılı Gümrük Kanunu, GTİP sınıflandırma..."></textarea>
      </div>
      <div className="md:col-span-2">
        <label className="block text-sm mb-1">Keywords (virgülle)</label>
        <input name="keywords" defaultValue={defaults.keywords} className="w-full border rounded px-3 py-2" placeholder="Türk gümrük mevzuatı, 4458, GTİP, Türkiye gümrük" />
      </div>
      <div className="md:col-span-2">
        <label className="block text-sm mb-1">OG Image URL</label>
        <input name="og_image_url" defaultValue={defaults.og_image_url} className="w-full border rounded px-3 py-2" placeholder="https://gumruk360.com/opengraph-image" />
      </div>
      <div className="md:col-span-2">
        <label className="block text-sm mb-1">JSON-LD (opsiyonel)</label>
        <textarea name="jsonld" rows={6} defaultValue={defaults.jsonld} className="w-full border rounded px-3 py-2" placeholder='{"@context":"https://schema.org","@type":"ProfessionalService","inLanguage":"tr-TR","areaServed":"TR","knowsAbout":["Türk gümrük mevzuatı","GTİP","4458 sayılı Gümrük Kanunu"]}' />
      </div>
      <div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={defaults.is_active} /> Aktif
        </label>
      </div>
      <div className="md:col-span-2">
        <button type="submit" className="px-3 py-2 rounded bg-blue-600 text-white">Kaydet</button>
      </div>
    </form>
  );
}
