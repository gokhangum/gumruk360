// app/worker/blog/[id]/edit/page.tsx
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import BlogForm from "@/components/blog/BlogForm";
import { getTranslations } from "next-intl/server";
export const runtime = "nodejs";

async function getMine(id: string) {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("blog_posts").select("*").eq("id", id).maybeSingle();
  return data;
}
async function getTenants() {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("tenants").select("id, primary_domain").order("primary_domain");
  return data ?? [];
}

export default async function WorkerBlogEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getMine(id);
  if (!post) return notFound();
  const tenants = await getTenants();
const t = await getTranslations("WorkerBlogEdit");
  return (

   <div className="-mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 w-full max-w-none md:max-w-[928px]">
    <div className="card-surface shadow-colored rounded-xl">
        <div className="px-5 py-4 border-b border-slate-100">
    <main className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">{t("heading")}</h1>
     <BlogForm mode="edit" postId={id} tenants={tenants as any} initial={post as any} role="worker" />
    </main></div></div></div>
  );
}
