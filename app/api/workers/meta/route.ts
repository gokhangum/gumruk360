
// app/api/workers/meta/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { APP_DOMAINS } from "@/lib/config/appEnv";
const BUCKET = "workers-cv"; // IMPORTANT: dash, not underscore

function hostFromEnv(url?: string | null): string | null {
  try { return url ? new URL(url).hostname.toLowerCase() : null; } catch { return null; }
}
function detectLocale(req: Request): "tr" | "en" {
  const trHost = hostFromEnv(process.env.APP_BASE_URL_TR || process.env.NEXT_PUBLIC_APP_BASE_URL_TR || null);
  const enHost = hostFromEnv(process.env.APP_BASE_URL_EN || process.env.NEXT_PUBLIC_APP_BASE_URL_EN || null);
  let reqHost = "localhost";
  try { reqHost = new URL(req.url).hostname.toLowerCase(); } catch {}
  if (enHost && reqHost === enHost) return "en";
  if (trHost && reqHost === trHost) return "tr";
  if (reqHost === "127.0.0.1") return "en";
  if (reqHost === "localhost") return "tr";
  if (APP_DOMAINS.en && (reqHost === APP_DOMAINS.en || reqHost.endsWith(APP_DOMAINS.en))) return "en";
  if (APP_DOMAINS.primary && (reqHost === APP_DOMAINS.primary || reqHost.endsWith(APP_DOMAINS.primary))) return "tr";
  return "tr";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const idsParam = url.searchParams.get("ids") || "";
    const qLang = (url.searchParams.get("lang") || "").toLowerCase();
    const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean);
    if (!ids.length) {
      return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });
    }

    const locale = (qLang === "en" || qLang === "tr") ? (qLang as "en" | "tr") : detectLocale(req);

    const { data, error } = await supabaseAdmin
      .from("worker_cv_profiles")
      .select("worker_user_id, title_tr, title_en, photo_object_path")
      .in("worker_user_id", ids);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    const out: Array<{
      id: string;
      title: string | null;
      title_tr: string | null;
      title_en: string | null;
      photoPath: string | null;
      photoUrl: string | null;
    }> = [];

    for (const row of (data || []) as any[]) {
      const id = row.worker_user_id as string;
      const title_tr = (row.title_tr as string) || null;
      const title_en = (row.title_en as string) || null;
      const photoPath = (row.photo_object_path as string) || `${id}/profile.jpg`;

      // Generate a long-lived signed URL for the exact path under workers-cv bucket
      let photoUrl: string | null = null;
      try {
        const { data: signed } = await supabaseAdmin
          .storage
          .from(BUCKET)
          .createSignedUrl(photoPath, 60 * 60 * 24 * 7); // 7 days
        photoUrl = signed?.signedUrl || null;
      } catch {}

      out.push({
        id,
        title: (locale === "en" ? title_en : title_tr) || null,
        title_tr,
        title_en,
        photoPath,
        photoUrl,
      });
    }

    return NextResponse.json({ ok: true, data: out, locale });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "internal_error" }, { status: 500 });
  }
}
