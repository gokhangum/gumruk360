// app/admin/seo/page.tsx
export const runtime = "nodejs";

import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { upsertSeoAction } from "./actions";
import AdminSeoForm from "./AdminSeoForm";
import RowActions from "./RowActions";

type TenantRow = { id: string; code: string; locale: string | null };
type DomainRow = { tenant_id: string; host: string };
type Seo = {
  tenant_code: string; locale: string; route: string;
  title: string | null; description: string | null; keywords: string[] | null;
  og_image_url: string | null; jsonld: any | null; is_active: boolean; updated_at: string;
};

function hostOnly(h: string) { return (h || "").split(":" )[0].toLowerCase(); }

export default async function AdminSeoPage(
   { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }
 ) {

  const hdrs = await headers();
  const host = hostOnly(hdrs.get("x-forwarded-host") || hdrs.get("host") || "");

  const { data: tenantsRes } = await supabaseAdmin
    .from("tenants")
    .select("id, code, locale")
    .order("code", { ascending: true });

  const { data: domainsRes } = await supabaseAdmin
    .from("tenant_domains")
    .select("tenant_id, host")
    .order("host", { ascending: true });

  const { data: rowsRes } = await supabaseAdmin
    .from("tenant_seo")
    .select("*")
    .order("tenant_code", { ascending: true })
    .order("locale", { ascending: true })
    .order("route", { ascending: true });

  const tenants = (tenantsRes || []) as TenantRow[];
  const domains = (domainsRes || []) as DomainRow[];
  const list = (rowsRes || []) as Seo[];

  const byId = new Map(tenants.map(t => [t.id, { code: t.code, locale: t.locale || "" }]));
  const items = domains
    .map(d => {
      const info = byId.get(d.tenant_id);
      if (!info) return null;
      return { tenant_code: info.code, host: d.host, locale: info.locale };
    })
    .filter(Boolean) as { tenant_code: string; host: string; locale: string }[];

  const match = items.find(i => hostOnly(i.host) === host);
  const defaultTenantCode = match?.tenant_code || (items[0]?.tenant_code || "");
  const defaultLocale = match?.locale || (items[0]?.locale || "");

  const params = await searchParams;
  const et = (params.edit_tenant as string) || "";
  const el = (params.edit_locale as string) || "";
 const er = (params.edit_route as string) || "";
  const initial =
    et && el && er
      ? list.find(r => r.tenant_code === et && r.locale === el && r.route === er) || null
      : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">SEO Yönetimi (Tenant Bazlı)</h1>

      <div className="rounded border p-4">
        <h2 className="font-semibold mb-3">{initial ? "Kaydı Düzenle" : "Yeni / Güncelle"}</h2>
       {items.length > 0 ? (
     <AdminSeoForm
        items={items}
         defaultTenantCode={defaultTenantCode}
        defaultLocale={defaultLocale}
        formAction={upsertSeoAction}
         initialRecord={initial}
        />
        ) : (
          <div className="text-sm text-red-600">tenant_domains dolu değil veya eşleşme yapılamadı.</div>
        )}
      </div>

      <div className="rounded border p-4">
        <h2 className="font-semibold mb-3">Kayıtlar</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Locale</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Aktif</th>
                <th className="px-3 py-2">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {(list || []).map((r) => (
                <tr key={`${r.tenant_code}:${r.locale}:${r.route}`} className="border-t align-top">
                  <td className="px-3 py-2 font-mono">{r.tenant_code}</td>
                  <td className="px-3 py-2 font-mono">{r.locale}</td>
                  <td className="px-3 py-2 font-mono">{r.route}</td>
                  <td className="px-3 py-2">{r.title || "—"}</td>
                  <td className="px-3 py-2">{r.is_active ? "Evet" : "Hayır"}</td>
                  <td className="px-3 py-2">
                    <RowActions
                      tenant_code={r.tenant_code}
                      locale={r.locale}
                      route={r.route}
                      is_active={r.is_active}
                    />
                  </td>
                </tr>
              ))}
              {(!list || list.length === 0) && (
                <tr>
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={6}>Kayıt yok.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
