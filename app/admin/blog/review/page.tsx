export const runtime = "nodejs";

import { listReviewPosts } from "./actions";
import ClientTable from "./ClientTable";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
export default async function AdminBlogReviewPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
	 const t = await getTranslations("admin.blog.review");
    const spRaw = await searchParams;
  const sp = Object.fromEntries(Object.entries(spRaw || {}).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));

  // Boş stringleri undefined yapalım ki actions.ts filtre uygulasın
  const status = sp.status ? String(sp.status) : undefined;
  const lang   = sp.lang   ? String(sp.lang)   : undefined;
  const tenant = sp.tenant ? String(sp.tenant) : undefined;
  const q      = sp.q      ? String(sp.q)      : undefined;
    // Tenants & languages
 const admin = typeof supabaseAdmin === "function" ? await (supabaseAdmin as any)() : supabaseAdmin;
  const { data: tenantsData, error: tenantsErr } = await admin
    .from("tenants")
    .select("id, code, primary_domain, locale");
  const tenants = Array.isArray(tenantsData) ? tenantsData : [];
  // (İsteğe bağlı) hata logu:
  // if (tenantsErr) console.error("tenants fetch error:", tenantsErr);

  const langOptions: string[] = Array.from(
    new Set((tenants ?? []).map((t: any) => t?.locale).filter(Boolean))
  ) as string[];

const rows = await listReviewPosts({ status: status as "" | "all" | "in_review" | "scheduled" | "draft" | "published" | "archived" | undefined, lang, tenant, q });

  // Kapak görsellerine signed URL üret (1 saat)
  const rowsWithCovers = await Promise.all(
    (rows || []).map(async (p: any) => {
      if (!p?.cover_image_path) return { ...p, cover_signed_url: null };
      const { data } = await admin.storage
        .from("blog")
        .createSignedUrl(p.cover_image_path, 3600);
      return { ...p, cover_signed_url: data?.signedUrl ?? null };
    })
  );
  return (
    <main className="mx-auto max-w-[clamp(320px,95vw,1200px)] p-4 md:p-6">
    <div className="mb-4 flex items-center justify-between gap-3">
  <h1 className="text-2xl md:text-3xl font-semibold">{t("title")}</h1>
  <Link
    href="/admin/blog/new"
    className="btn bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2"
  >
   {t("actions.addNew")}
  </Link>
</div>

      <form action="/admin/blog/review" method="get" className="grid md:grid-cols-5 gap-2 bg-white border rounded-2xl p-3 mb-4">
       <input name="q" defaultValue={q} placeholder={t("filters.q.placeholder")} className="border rounded-md px-3 py-2" />
       <select name="status" defaultValue={status || ""} className="border rounded-md px-3 py-2">
          <option value="">{t("filters.status.all")}</option>
<option value="in_review">{t("status.in_review")}</option>
<option value="draft">{t("status.draft")}</option>
<option value="scheduled">{t("status.scheduled")}</option>
<option value="published">{t("status.published")}</option>
<option value="archived">{t("status.archived")}</option>
        </select>
       <select name="lang" defaultValue={lang || ""} className="border rounded-md px-3 py-2">
  <option value="">{t("filters.lang.all")}</option>
  {langOptions.map(l => (
    <option key={l} value={l}>{l}</option>
  ))}
</select>
        <select name="tenant" defaultValue={tenant || ""} className="border rounded-md px-3 py-2">
  <option value="">{t("filters.tenant.all")}</option>
  {tenants.map(t => (
    <option key={t.id} value={t.id}>
      {t.code ?? t.primary_domain ?? t.id.slice(0,8)}
    </option>
  ))}
</select>
        <button className="btn bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2">{t("filters.submit")}</button>
      </form>

       {rowsWithCovers.length === 0 ? (
        <div className="text-sm text-gray-600 border bg-white rounded-2xl p-4">
          {t("empty")}
        </div>
      ) : (
        <ClientTable rows={rowsWithCovers as any} />
      )}
    </main>
  );
}
