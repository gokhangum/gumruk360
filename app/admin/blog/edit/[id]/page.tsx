// app/admin/blog/edit/[id]/page.tsx
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import BlogForm from "@/components/blog/BlogForm";
import { getTranslations } from "next-intl/server";
export const runtime = "nodejs";

async function getPost(id: string) {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("blog_posts").select("*").eq("id", id).maybeSingle();
  return data;
}
async function getTenants() {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("tenants").select("id, primary_domain").order("primary_domain");
  return data ?? [];
}

export default async function AdminBlogEditPage({ params }: { params: Promise<{ id: string }> }) {
	const t = await getTranslations("admin.blog");
	const { id } = await params;
  const post = await getPost(id);
  if (!post) return notFound();
  const tenants = await getTenants();

  return (
    <main className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">{t("edit.title")}</h1>
      <BlogForm mode="edit" postId={id} tenants={tenants as any} initial={post as any} role="admin" />
    </main>
  );
}
