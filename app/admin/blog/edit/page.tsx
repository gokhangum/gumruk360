// app/admin/blog/edit/page.tsx
import { redirect } from "next/navigation";

async function getAdminClient() {
  let adminMod: any = null;
  let serverAdminMod: any = null;
  try { adminMod = await import("@/lib/supabase/admin"); } catch {}
  try { serverAdminMod = await import("@/lib/supabase/serverAdmin"); } catch {}
  const cand =
    adminMod?.supabaseAdmin ??
    serverAdminMod?.supabaseAdmin ??
    adminMod?.createAdminClient ??
    serverAdminMod?.createAdminClient ??
    null;
  if (!cand) throw new Error("Admin client export not found");
  return typeof cand === "function" ? await cand() : cand;
}

export const dynamic = "force-dynamic";

export default async function AdminEditEntry({ searchParams }: { searchParams?: Record<string,string|string[]|undefined> }) {
  const sp = Object.fromEntries(Object.entries(searchParams || {}).map(([k,v]) => [k, Array.isArray(v)? v[0] : v]));
  const id  = (sp.id as string) || (sp.postId as string) || "";
  const slug = (sp.slug as string) || "";

  if (id) {
    redirect(`/admin/blog/edit/${encodeURIComponent(id)}`);
  }

  if (slug) {
    const sb = await getAdminClient();
    const { data } = await sb.from("blog_posts").select("id").eq("slug", slug).limit(1).maybeSingle();
    if (data?.id) redirect(`/admin/blog/edit/${encodeURIComponent(data.id)}`);
  }

  redirect("/admin/blog/review");
}
