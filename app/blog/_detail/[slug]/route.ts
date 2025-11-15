import { NextResponse } from "next/server";

async function getServerClient() {
  const mod = await import("@/lib/supabase/server");
  if (!mod?.supabaseServer) {
    throw new Error("supabaseServer not found");
  }
  return await mod.supabaseServer();
 }

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const sb = await getServerClient();
  const slug = params.slug;

  // 1) Fetch the post
  const { data: post, error: e1 } = await sb
    .from("blog_posts")
    .select("id, slug, lang, title, summary, status, tags, updated_at, created_at")
    .eq("slug", slug)
    .single();
  if (e1 || !post) return NextResponse.json({ error: e1?.message || "not found" }, { status: 404 });

  // Only operate on published neighbors/related
  const lang = post.lang;
  const updated = post.updated_at;

  // 2) Prev/Next by updated_at in same lang (published only)
  const { data: prevList } = await sb
    .from("blog_posts")
    .select("id, slug, title, updated_at")
    .eq("status", "published")
    .eq("lang", lang)
    .lt("updated_at", updated)
    .order("updated_at", { ascending: false })
    .limit(1);

  const { data: nextList } = await sb
    .from("blog_posts")
    .select("id, slug, title, updated_at")
    .eq("status", "published")
    .eq("lang", lang)
    .gt("updated_at", updated)
    .order("updated_at", { ascending: true })
    .limit(1);

  const prev = prevList?.[0] || null;
  const next = nextList?.[0] || null;

  // 3) Related by tags overlap (same lang, published, excluding self)
  let related: any[] = [];
  if (Array.isArray(post.tags) && post.tags.length) {
    const { data: rel } = await sb
      .from("blog_posts")
      .select("id, slug, title, updated_at, tags")
      .eq("status", "published")
      .eq("lang", lang)
      .neq("id", post.id)
      .overlaps("tags", post.tags)
      .order("updated_at", { ascending: false })
      .limit(6);
    related = rel || [];
  }

  return NextResponse.json({ post, prev, next, related });
}
