// app/admin/blog/new/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import BlogForm from "@/components/blog/BlogForm";
import { getTranslations } from "next-intl/server";
export const runtime = "nodejs";

async function getTenants() {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("tenants").select("id, primary_domain").order("primary_domain");
  return data ?? [];
}

export default async function AdminBlogNewPage() {
	const t = await getTranslations("admin.blog");
  const tenants = await getTenants();
  return (
    <main className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">{t("new.title")}</h1>
      <BlogForm mode="create" tenants={tenants as any} role="admin" />
    </main>
  );
}
