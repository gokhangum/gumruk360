// app/api/news/upload-image/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

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

const BUCKET = "news";

function safeSlug(name: string) {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const postId = String(form.get("postId") || "");

    if (!file)  return NextResponse.json({ ok: false, error: "FILE_REQUIRED" }, { status: 400 });
    if (!postId) return NextResponse.json({ ok: false, error: "POST_ID_REQUIRED" }, { status: 400 });

    const allowed = ["image/png","image/jpeg","image/webp","image/gif","image/svg+xml"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ ok: false, error: "UNSUPPORTED_TYPE" }, { status: 415 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "FILE_TOO_LARGE" }, { status: 413 });
    }

    const admin = await getAdminClient();
    const arrayBuf = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    const stamp = new Date().toISOString().replace(/[:.]/g, "");
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
    const clean = safeSlug(file.name.replace(/\.[^.]+$/, "")) || randomUUID();
    const objectPath = `${postId}/${stamp}-${clean}${ext ? "." + ext : ""}`;

    const up = await admin.storage.from(BUCKET).upload(objectPath, buf, {
      contentType: file.type,
      upsert: false,
    });
    if (up.error) {
      return NextResponse.json({ ok: false, error: up.error.message }, { status: 500 });
    }

    const pub = admin.storage.from(BUCKET).getPublicUrl(objectPath);
    const publicUrl = pub?.data?.publicUrl;
    if (!publicUrl) {
      return NextResponse.json({ ok: false, error: "PUBLIC_URL_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: publicUrl, path: objectPath });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "UPLOAD_ERROR" }, { status: 500 });
  }
}
