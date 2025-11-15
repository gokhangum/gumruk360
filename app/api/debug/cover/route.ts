// app/api/debug/cover/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant/current";

export const runtime = "nodejs";

function resolvePublicUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return "/" + path;
  return `${base}/storage/v1/object/public/blog/${path}`;
}

async function getPostBySlug(slug: string) {
  const supabase = await supabaseServer();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase.rpc("fn_blog_get_public_by_slug", {
    p_tenant_id: tenantId,
    p_lang: "tr-TR",
    p_slug: slug,
  });
  if (error) throw error;
  return data as any;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) return NextResponse.json({ ok: false, error: "slug required" }, { status: 400 });

  try {
    const post = await getPostBySlug(slug);
    if (!post) return NextResponse.json({ ok: false, error: "post not found" }, { status: 404 });

    const supabase = await supabaseServer();
    let cover = resolvePublicUrl(post.cover_image_path || undefined);

    let latest: string | null = null;
    if (!cover) {
      const { data } = await supabase
        .schema("storage").from("objects")
        .select("name, created_at")
        .eq("bucket_id", "blog")
        .like("name", `${post.id}/%`)
        .order("created_at", { ascending: false })
        .limit(1);
      latest = data?.[0]?.name ?? null;
      if (latest) cover = resolvePublicUrl(latest);
    }

    let headStatus: number | null = null;
    let headOk = false;
    if (cover) {
      try {
        const resp = await fetch(cover, { method: "HEAD" });
        headStatus = resp.status;
        headOk = resp.ok;
      } catch (e) {
        headStatus = -1;
      }
    }

    return NextResponse.json({
      ok: true,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
      },
      post: {
        id: post.id,
        slug: post.slug,
        cover_image_path: post.cover_image_path,
      },
      latestObjectName: latest,
      resolvedCoverUrl: cover,
      headOk,
      headStatus,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "ERR" }, { status: 500 });
  }
}
