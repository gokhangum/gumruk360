export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { supabaseServer } from "../../../../lib/supabase/server";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(url, key, { auth: { persistSession: false } });
}

function guessContentType(name: string) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "html":
    case "htm":
      return "text/html; charset=utf-8";
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "txt":
      return "text/plain; charset=utf-8";
    case "csv":
      return "text/csv; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
    case "xml":
      return "application/xml; charset=utf-8";
    case "md":
      return "text/markdown; charset=utf-8";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
}

export async function GET(req: Request) {
  try {
    const s = await supabaseServer();
    const a = admin();

    const url = new URL(req.url);
    const bucket = url.searchParams.get("bucket") || "attachments";
    const path = url.searchParams.get("path") || "";
    const name = url.searchParams.get("name") || path.split("/").pop() || "file";

    if (!path) {
      return NextResponse.json({ ok: false, error: "missing_path" }, { status: 400 });
    }

    // Auth
    const { data: u } = await s.auth.getUser();
    const userId = u?.user?.id || null;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
    }

    // Security: allow only contact attachments and only owner (or admin) to access
    // expected form: attachments/contact/<ticketId>/<fileName>
    const parts = path.split("/");
    // If full "attachments/contact/..." provided, strip leading "attachments/"
    let idx = 0;
    if (parts[0] === "attachments") idx = 1;
    const category = parts[idx];
    const ticketId = parts[idx + 1];

    if (category !== "contact" || !ticketId) {
      return NextResponse.json({ ok: false, error: "forbidden_path" }, { status: 403 });
    }

    // fetch ticket and ownership
    const { data: t } = await a.from("contact_tickets").select("id,user_id").eq("id", ticketId).maybeSingle();
    if (!t) {
      return NextResponse.json({ ok: false, error: "ticket_not_found" }, { status: 404 });
    }

    // is admin?
    let isAdmin = false;
    const { data: prof } = await a.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (prof?.role === "admin") isAdmin = true;

    if (!isAdmin && t.user_id !== userId) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    // download from storage with service role to avoid RLS surprises
    const download = await a.storage.from(bucket).download(path);
    if (download.error) {
      // try without "attachments/" prefix if present
      const altPath = path.startsWith("attachments/") ? path.substring("attachments/".length) : `attachments/${path}`;
      const alt = await a.storage.from(bucket).download(altPath);
      if (alt.error) {
        return NextResponse.json({ ok: false, error: "download_failed", hint: download.error.message || alt.error.message }, { status: 404 });
      } else {
        const mime = guessContentType(name);
        return new Response(alt.data, {
          status: 200,
          headers: {
            "Content-Type": mime,
            "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
            "Cache-Control": "private, max-age=60",
          },
        });
      }
    }

    const mime = guessContentType(name);
    return new Response(download.data, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "internal_error", message: e?.message || String(e) }, { status: 500 });
  }
}
