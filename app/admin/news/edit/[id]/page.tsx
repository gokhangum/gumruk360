export const runtime = "nodejs";

import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import NewsForm from "@/components/news/NewsForm";

export default async function AdminNewsEditPage({ params }: { params: Promise<{ id: string }> }) {
  const supa = supabaseAdmin;
  const { id } = await params;
 const [{ data: news, error }, { data: tenants, error: terr }, { data: domains }] = await Promise.all([
     supa.from("site_news").select("*").eq("id", id).single(),
    supa.from("tenants").select("id, primary_domain").order("primary_domain", { ascending: true }),
     supa.from("tenant_domains").select("tenant_id, host, domain, is_primary")
  ]);

  if (terr) {
    console.error("tenants error:", terr.message);
  }


  if (error || !news) return notFound();

  const withDomain = (tenants || []).map(t => {
  const d = (domains || []).find(x => x.tenant_id === t.id && (x.is_primary === true || x.is_primary === "true"));
  const pd = t.primary_domain || d?.host || d?.domain || null;
   return { id: t.id, name: null, primary_domain: pd };
  });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Haberi Düzenle</h1>
      <div className="rounded-2xl border border-gray-200 shadow-sm bg-white p-4 md:p-6">
        <NewsForm mode="edit" initial={news} tenants={withDomain} />
      </div>
    </div>
  );
}