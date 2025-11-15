
// app/api/cv/preview/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { supabaseServer } from "@/lib/supabase/server";
import { APP_DOMAINS } from "@/lib/config/appEnv";
const BUCKET = "workers-cv";

function detectLocaleFromHeaders(req: Request): "tr" | "en" {
  try {
    const host = new URL(req.url).host.toLowerCase();
   if (APP_DOMAINS.primary && (host === APP_DOMAINS.primary || host.endsWith(APP_DOMAINS.primary))) return "tr";
    if (APP_DOMAINS.en && (host === APP_DOMAINS.en || host.endsWith(APP_DOMAINS.en))) return "en";
  } catch {}
  return "tr";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
const qs = new URL(req.url).searchParams;
const qLocale = qs.get("locale");
const locale = (qLocale === "en" || qLocale === "tr") ? qLocale : detectLocaleFromHeaders(req);
const lang = locale === "en" ? "en" : "tr";


  const admin = supabaseAdmin;

  // profile
  const profileQ = await admin.from("worker_cv_profiles")
    .select("display_name, title_tr, title_en, tags, hourly_rate_tl, photo_object_path")
    .eq("worker_user_id", id)
    .maybeSingle();
  if (profileQ.error) return NextResponse.json({ ok: false, error: profileQ.error.message }, { status: 400 });

  // blocks (only current language)
  const blocksQ = await admin.from("worker_cv_blocks")
    .select("id, block_type, body_rich, order_no, lang")
    .eq("worker_user_id", id)
    .eq("lang", lang)
    .order("order_no", { ascending: true });
  if (blocksQ.error) return NextResponse.json({ ok: false, error: blocksQ.error.message }, { status: 400 });

  // cv_block_types for display titles
  let typeMap = new Map<string, string>();
  const typesQ = await admin.from("cv_block_types")
    .select("key, title_tr, title_en, is_active, order_no")
    .eq("is_active", true)
    .order("order_no", { ascending: true });
  if (!typesQ.error && Array.isArray(typesQ.data)) {
    for (const t of typesQ.data as any[]) {
      typeMap.set(t.key, (locale === "en" ? t.title_en : t.title_tr) || t.key);
    }
  }

  // localize block_type using cv_block_types
  const mappedBlocks = (blocksQ.data ?? []).map((b: any) => ({
    ...b,
    block_type: typeMap.get(b.block_type) || b.block_type
  }));

  // Photo signed URL
  let photoUrl: string | null = null;
  const objectPath = (profileQ.data as any)?.photo_object_path || `${id}/profile.jpg`;
  try {
    const { data: signed1 } = await admin.storage.from(BUCKET).createSignedUrl(objectPath, 60 * 60 * 24 * 365);
    if (signed1?.signedUrl) {
      photoUrl = signed1.signedUrl;
    } else {
      const supa = await supabaseServer();
      const { data: signed2 } = await supa.storage.from(BUCKET).createSignedUrl(objectPath, 60 * 60 * 24 * 365);
      if (signed2?.signedUrl) photoUrl = signed2.signedUrl;
    }
  } catch {}

  return NextResponse.json({
    ok: true,
    data: { profile: profileQ.data ?? null, blocks: mappedBlocks, photoUrl, locale }
  });
}
