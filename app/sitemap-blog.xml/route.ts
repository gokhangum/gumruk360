// app/sitemap-blog.xml/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant/current";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";

export async function GET() {
  const supabase = supabaseAdmin;
  const tenantId = await getCurrentTenantId();

  const { data, error } = await supabase
    .from("v_blog_public")
    .select("slug, published_at, tenant_id, tenant_domain");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const items = (data || []).filter((x: any) => {
    return (tenantId ? x.tenant_id === tenantId : x.tenant_id === null);
  });

  const site = items[0]?.tenant_domain ? `https://${items[0].tenant_domain}` : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${items.map((p:any)=>`
    <url>
      <loc>${site}${"/blog/" + p.slug}</loc>
      ${p.published_at ? `<lastmod>${new Date(p.published_at).toISOString()}</lastmod>` : ""}
      <changefreq>weekly</changefreq>
      <priority>0.6</priority>
    </url>
  `).join("")}
</urlset>`;

  return new NextResponse(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
