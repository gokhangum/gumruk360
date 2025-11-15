import { NextResponse } from "next/server";

// Public search endpoint for internal linking
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const lang = searchParams.get("lang") || null;

  // Resolve server client (RLS honored)
  let sb: any;
  try {
    const mod = await import("@/lib/supabase/server");
    sb = typeof mod.supabaseServer === "function" ? await mod.supabaseServer() : mod.supabaseServer;
  } catch {
    return NextResponse.json({ items: [], error: "server client not found" }, { status: 500 });
  }

  if (!q) return NextResponse.json({ items: [] });

  let query = sb
    .from("blog_posts")
    .select("id, title, slug, updated_at")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(10);

  if (lang) query = query.eq("lang", lang);
  // basic match on title or slug
  query = query.or(`title.ilike.%${q}%,slug.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ items: [], error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}
