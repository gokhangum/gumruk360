// app/news/rss.xml/route.ts
export const runtime = "nodejs";

import { resolveTenantFromHeaders } from "@/lib/tenant/resolve";
import { getTranslations } from "next-intl/server";
 async function getServerClient() {
  const mod = await import("@/lib/supabase/server");
  const supabaseServer = mod.supabaseServer as () => Promise<any>;
 if (typeof supabaseServer !== "function") {
    throw new Error("supabaseServer not found");
   }
  return await supabaseServer();
 }

export async function GET() {
  const ctx = await resolveTenantFromHeaders(); // baseUrl, tenantId, lang vs.
  const sb = await getServerClient();
  const tr = await getTranslations("news.rss");
  const tenantId = (ctx?.tenantId || "").trim();


  const baseQuery = sb
    .from("site_news")
    .select("id, slug, title, summary, content_json, lang, published_at, updated_at, cover_image_path, tenant_id, is_published")
    .eq("is_published", true)
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .or("expires_at.is.null,expires_at.gt.now()");

  // BLOG RSS ile aynı davranış:
  // - tenantId varsa: SADECE o tenant'ın kayıtları
  // - tenantId yoksa: SADECE tenant_id IS NULL olan global kayıtlar
  const filteredQuery = tenantId
    ? baseQuery.eq("tenant_id", tenantId)
    : baseQuery.is("tenant_id", null);

  const { data, error } = await filteredQuery
    .order("published_at", { ascending: false })
    .limit(50);


  if (error) {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${tr("channelTitle")}</title><link>${ctx.baseUrl}</link><description>${tr("errorDescription")}</description></channel></rss>`, {
      headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
      status: 500,
    });
  }

  const items = (data || []).map((row: any) => {
    const link = `${ctx.baseUrl}/news/${row.slug}`;
    const pub = row.published_at ? new Date(row.published_at).toUTCString() : new Date().toUTCString();
    const guid = row.id || row.slug;
    const desc = row.summary || row.title;
    // content:encoded (JSON tiptap’tan sade metin; istersen zengin HTML’e çevirebilirsin)
    const body = row.content_json ? (() => {
      try { return JSON.parse(row.content_json); } catch { return null; }
    })() : null;

    const cover = row.cover_image_path
      ? (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "") + "/storage/v1/object/public/" + String(row.cover_image_path).replace(/^\/+/, "")
      : "";

    return [
      "<item>",
      `<title><![CDATA[${row.title}]]></title>`,
      `<link>${link}</link>`,
      `<guid isPermaLink="false">${guid}</guid>`,
      `<pubDate>${pub}</pubDate>`,
      `<description><![CDATA[${desc}]]></description>`,
      cover ? `<enclosure url="${cover}" type="image/jpeg" />` : "",
      "</item>",
    ].join("");
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${tr("channelTitle")}</title>
<link>${ctx.baseUrl}</link>
<description>${tr("channelDescription")}</description>
${items}
</channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
