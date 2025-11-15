export const runtime = "nodejs";
import { NextResponse } from "next/server";

/** Projedeki admin client export adını güvenle resolve eder */
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

/** Basit skorlayıcı */
function scoreText(t: string, q: string) {
  const lc = (t || "").toLowerCase();
  const qq = q.toLowerCase();
  if (lc.startsWith(qq)) return 100;
  if (lc.includes(` ${qq}`)) return 80;
  if (lc.includes(qq)) return 60;
  return 10;
}

/** GET /api/blog/link-suggest?q=...&lang=tr&limit=6 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const lang = (url.searchParams.get("lang") || "").trim() || null;
  const limit = Math.min(+(url.searchParams.get("limit") || 6), 12);

  if (q.length < 3) return NextResponse.json({ items: [] });

  const admin = await getAdminClient();

  const like = `%${q}%`;
  let query = admin
    .from("blog_posts")
    .select("slug,title,summary,keywords,lang,status,tenant_id")
    .eq("status", "published");

  if (lang) query = query.eq("lang", lang);

  query = query.or([
    `title.ilike.${like}`,
    `summary.ilike.${like}`,
    `keywords.cs.{${q}}`,
  ].join(",")).limit(limit * 3);

  const { data, error } = await query;
  if (error) return NextResponse.json({ items: [], error: error.message }, { status: 500 });

  const items = (data || [])
    .map((r: any) => ({
      slug: r.slug,
      title: r.title,
      score: scoreText(`${r.title} ${r.summary} ${(r.keywords||[]).join(" ")}`, q),
    }))
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, limit);

  return NextResponse.json({ items });
}

/** POST /api/blog/link-suggest  body: { queries: string[], lang?: string, limit?: number } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const queries: string[] = Array.isArray(body?.queries) ? body.queries : [];
  const lang: string | null = (body?.lang || "").trim() || null;
  const limit = Math.min(+(body?.limit || 5), 10);

  const admin = await getAdminClient();

  // Hepsi için tek çekiş (basit yaklaşım: OR ile birleştir, sonra client’ta grupla)
  const likes = queries
    .filter(q => (q || "").trim().length >= 3)
    .map(q => `%${q.trim()}%`);

  if (likes.length === 0) return NextResponse.json({ itemsByQuery: {} });

  let query = admin
    .from("blog_posts")
    .select("slug,title,summary,keywords,lang,status,tenant_id")
    .eq("status", "published");

  if (lang) query = query.eq("lang", lang);

  // çoklu OR
  query = query.or(
    likes.flatMap(lk => [
      `title.ilike.${lk}`,
      `summary.ilike.${lk}`,
    ]).join(",")
  ).limit(100);

  const { data, error } = await query;
  if (error) return NextResponse.json({ itemsByQuery: {}, error: error.message }, { status: 500 });

  const itemsByQuery: Record<string, {slug:string;title:string;score:number}[]> = {};
  for (const q of queries) {
    if (!q || q.trim().length < 3) { itemsByQuery[q] = []; continue; }
    const filtered = (data || []).map((r: any) => ({
      slug: r.slug,
      title: r.title,
      score: scoreText(`${r.title} ${r.summary} ${(r.keywords||[]).join(" ")}`, q),
    }))
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, limit);
    itemsByQuery[q] = filtered;
  }

  return NextResponse.json({ itemsByQuery });
}
