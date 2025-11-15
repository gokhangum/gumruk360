export const runtime = "nodejs";

import { supabaseAdmin } from "@/lib/supabase/admin";
import NewsForm from "@/components/news/NewsForm";

export default async function AdminNewsNewPage() {
  const supa = supabaseAdmin;
   const [{ data: tenants, error: terr }, { data: domains }] = await Promise.all([
   supa.from("tenants").select("id, primary_domain").order("primary_domain", { ascending: true }),
    supa.from("tenant_domains").select("tenant_id, host, domain, is_primary")
  ]);

  if (terr) {
    console.error("tenants error:", terr.message);
   }


  const withDomain = (tenants || []).map(t => {
    const d = (domains || []).find(x => x.tenant_id === t.id && (x.is_primary === true || x.is_primary === "true"));
   const pd = t.primary_domain || d?.host || d?.domain || null;
     return { id: t.id, name: null, primary_domain: pd };
 });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Yeni Haber/Duyuru</h1>
      <div className="rounded-2xl border border-gray-200 shadow-sm bg-white p-4 md:p-6">
        <NewsForm mode="create" tenants={withDomain} />
      </div>
    </div>
  );
}