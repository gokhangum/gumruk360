// app/blog/rss/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant/current";
import { getTranslations } from "next-intl/server";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await supabaseServer();
  const tenantId = await getCurrentTenantId();
const t = await getTranslations("Rss");
  const { data, error } = await supabase
    .from("v_blog_public")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const items = (data || []).filter((x: any) => {
    return (tenantId ? x.tenant_id === tenantId : x.tenant_id === null);
  });

  const site = items[0]?.tenant_domain ? `https://${items[0].tenant_domain}` : "";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${t("title")}</title>
  <link>${site || ""}</link>
  <description>${t("description")}</description>
  ${items.map((p:any)=>`
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${site}${"/blog/" + p.slug}</link>
      <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
      <guid>${p.id}</guid>
      <description><![CDATA[${p.summary || ""}]]></description>
    </item>
  `).join("")}
</channel>
</rss>`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" }
  });
}
