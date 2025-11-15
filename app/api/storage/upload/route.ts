import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"

export const runtime = "nodejs"

function safeName(name: string) {
  const noDiacritics = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  const cleaned = noDiacritics.replace(/[^a-zA-Z0-9._-]/g, "-")
  return cleaned.slice(0, 100) || "file"
}

function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

export async function POST(req: NextRequest) {
  try {
    // 1) Auth
    const sb = await supabaseServer()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { console.error("[upload] unauthorized"); return NextResponse.json({ error: "unauthorized" }, { status: 401 }) }

    // 2) FormData / file
    const form = await req.formData()
	console.log("[upload] form received");
    const file = form.get("file") as File | null
   if (!file) { console.error("[upload] file_required (no file in form)"); return NextResponse.json({ error: "file_required" }, { status: 400 }) }

    const size = file.size
    const MAX = 20 * 1024 * 1024 // 20 MB
    if (size > MAX) return NextResponse.json({ error: "file_too_large" }, { status: 413 })

    const originalName = (form.get("filename") as string) || (file as any).name || "upload.bin"
    const contentType = file.type || "application/octet-stream"
    const buffer = Buffer.from(await file.arrayBuffer())
console.log("[upload] file meta", { size, contentType: file.type, name: (file as any).name || form.get("filename") || "?" });
    // Zorunlu question_id + scope
     const qidRaw = (form.get("question_id") as string | null)?.trim() || ""
     if (!isUUID(qidRaw)) return NextResponse.json({ error: "question_id_required" }, { status: 400 })
    const question_id = qidRaw

     const scopeRaw = ((form.get("scope") as string | null) || "question").toLowerCase()
     const scope = (scopeRaw === "answer") ? "answer" : "question"
console.log("[upload] question_id/scope", { question_id, scope });

     // 3) Object key (listeleme ile uyumlu)
     const stamp = Date.now()
     const basePrefix = (scope === "answer")
      ? `${question_id}/answers/`
      : `${question_id}/`
    const key = `${basePrefix}${stamp}-${safeName(originalName)}`
console.log("[upload] key", { key });
    // 4) Storage upload (Service Role)
    const admin = supabaseAdmin;
    const { error: upErr } = await admin.storage.from("attachments").upload(key, buffer, {
      contentType,
      upsert: false,
    })
  if (upErr) {
     console.error("[upload] storage.upload failed", { message: upErr.message, name: upErr.name, key, bucket: "attachments" });
      return NextResponse.json({ error: "upload_failed", detail: upErr.message }, { status: 500 })
   }
console.log("[upload] storage.upload ok", { key });
    // 5) DB kaydı (object_path + file_path + uploaded_by + scope)
    const insertRow: any = {
      owner_id: user.id,
      object_path: key,
      file_path: key,
      original_name: originalName,
      content_type: contentType,
      size,
    file_name: safeName(originalName),
    file_size: size,
      bucket: "attachments",
    mime: contentType,
  scope: scope,
   }
    if (question_id) insertRow.question_id = question_id
console.log("[upload] db.insert start", { table: "attachments", key, question_id });
    const { data: row, error: dbErr } = await admin
      .from("attachments")
      .insert(insertRow)
      .select("id, object_path, file_path, original_name, file_name, file_size, size, content_type, mime, question_id, created_at")
      .single()

    if (dbErr) {
       console.error("[upload] db.insert failed", { message: dbErr.message, code: (dbErr as any).code, key, question_id });
       await admin.storage.from("attachments").remove([key]).catch(() => {})
       return NextResponse.json({ error: "db_insert_failed", detail: dbErr.message }, { status: 500 })
     }
console.log("[upload] db.insert ok", { id: row?.id, object_path: row?.object_path });
    return NextResponse.json({ ok: true, file: row })
  } catch (e: any) {
    console.error("[upload] unexpected", { message: e?.message, stack: e?.stack });
     return NextResponse.json({ error: "unexpected", detail: e?.message }, { status: 500 })
  }
}
