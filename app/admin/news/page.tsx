export const runtime = "nodejs";

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";

import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
export default async function AdminNewsListPage() {
  const supa = supabaseAdmin;

  const { data, error } = await supa
    .from("site_news")
    .select("id, title, slug, lang, is_published, is_pinned, published_at, expires_at, tenant_id")
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(200);

 // Tenant primary domain eşlemesi için tenant_domains tablosunu da çek
  const { data: tenantsPD } = await supa
   .from("tenants")
    .select("id, primary_domain");
  const { data: domains } = await supa
   .from("tenant_domains")
    .select("tenant_id, host, domain, is_primary");
  if (error) {
    return <div className="p-6">Error: {error.message}</div>;
  }

  const rows = (data || []);
// tenants.primary_domain haritası
  const tenantPDMap = new Map<string, string>();
   (tenantsPD || []).forEach((t: any) => {
    if (t?.id && t?.primary_domain) tenantPDMap.set(String(t.id), String(t.primary_domain));
   });

  // tenant_domains'tan primary domain (host/domain) haritası
  const domainByTenant = new Map<string, string>();
  (domains || []).forEach((d: any) => {
   const isPrim = d?.is_primary === true || d?.is_primary === "true" || d?.is_primary === 1 || d?.is_primary === "1";
   if (isPrim && d?.tenant_id) {
      const val = d?.host || d?.domain;
     if (val) domainByTenant.set(String(d.tenant_id), String(val));
    }
  });

   // Verilen tenant_id için birincil domain'i (host/domain) döndür
   function getTenantDomain(tid?: string | null) {
    if (!tid) return null; // global ise null dön
   // ↓↓↓ GÜNCEL BLOK ↓↓↓
    const d1 = tenantPDMap.get(String(tid));           // tenants.primary_domain
    if (d1) return d1;
   const d2 = domainByTenant.get(String(tid));        // tenant_domains (primary)
     if (d2) return d2;
    return null;
   }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Site Haber & Duyuru</h1>
        <Link href="/admin/news/new" className="px-4 py-2 rounded-lg bg-blue-600 text-white">Yeni</Link>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-3">Başlık</th>
              <th className="p-3">Dil</th>
              <th className="p-3">Tenant</th>
              <th className="p-3">Yayında</th>
              <th className="p-3">Pinned</th>
			  <th className="p-3">Statü</th>
              <th className="p-3">Tarih</th>
              <th className="p-3">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n:any) => (
              <tr key={n.id} className="border-b">
                <td className="p-3">{n.title}</td>
                <td className="p-3 uppercase">{n.lang}</td>
              <td className="p-3">
    {getTenantDomain(n.tenant_id) ?? <span className="text-gray-400">global</span>}
  </td>
                <td className="p-3">{n.is_published ? "✓" : "—"}</td>
                <td className="p-3">{n.is_pinned ? "✓" : "—"}</td>
				<td className="p-3">
   {(!n.is_published || !n.published_at) ? (
     <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
      Taslak
    </span>
   ) : (n.expires_at && new Date(n.expires_at) < new Date()) ? (
    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">
       Süresi doldu
     </span>
    ) : (
     <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
       Yayında
      </span>
    )}
 </td>
                <td className="p-3">{n.published_at ? new Date(n.published_at).toLocaleString() : "—"}</td>
                   <td className="p-3 space-x-2">
  <Link className="text-blue-600 underline" href={`/admin/news/edit/${n.id}`}>Düzenle</Link>

  {/* Arşivle (onaylı) */}
  <ConfirmSubmit
    id={n.id}
    action="/api/news/archive"
    label="Arşivle"
    confirmText="Bu haberi yayından kaldırmak istiyor musun?"
    className="ml-2 px-2 py-1 rounded border text-xs"
  />

  {/* Sil (onaylı) */}
  <ConfirmSubmit
    id={n.id}
    action="/api/news/delete"
    label="Sil"
    confirmText="Bu haberi kalıcı olarak silmek istiyor musun? Bu işlem geri alınamaz."
    className="ml-2 px-2 py-1 rounded border border-red-600 text-red-600 text-xs"
  />
</td>


              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}