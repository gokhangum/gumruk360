import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";

const ALLOWED_KEYS = new Set<string>([
  "display_name",
  "title_tr",            // ✅
  "title_en",            // ✅
  "title",               // (geçiş için)
  "premium_percent",
  "hourly_rate_tl",
  "hourly_rate_currency",
  "languages",
  "tags",
  "slug",
  "photo_object_path",
]);


function normalizePayload(body: any) {
  const out: any = {};
  for (const k of Object.keys(body || {})) {
    if (!ALLOWED_KEYS.has(k)) continue;
    out[k] = body[k];
  }
  if (out.premium_percent !== undefined) {
    const n = Number(out.premium_percent);
    out.premium_percent = Number.isFinite(n) ? n : null;
  }
  if (out.hourly_rate_tl !== undefined) {
    const n = Number(out.hourly_rate_tl);
    out.hourly_rate_tl = Number.isFinite(n) ? n : null;
  }
  for (const key of ["languages", "tags"]) {
    const v = out[key];
    if (typeof v === "string") {
      out[key] = v.split(",").map((s: string) => s.trim()).filter(Boolean);
    } else if (Array.isArray(v)) {
      out[key] = v;
    } else if (v === undefined) {
    } else {
      out[key] = [];
    }
  }
  out.updated_at = new Date().toISOString();
  return out;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin;
  const { data, error } = await sb
    .from("worker_cv_profiles")
    .select("display_name, title_tr, title_en, premium_percent, hourly_rate_tl, hourly_rate_currency, languages, tags, slug, photo_object_path")
    .eq("worker_user_id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, data: data ?? {} });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const payload = normalizePayload(body);
  const sb = supabaseAdmin;
  const { data, error } = await sb
    .from("worker_cv_profiles")
    .update(payload)
    .eq("worker_user_id", id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, data });
}

// Some clients still send PUT. Support it by reusing PATCH logic.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return PATCH(req, ctx as any);
}
