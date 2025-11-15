
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "workers-cv";

function j(status: number, body: any) {
  return NextResponse.json(body, { status });
}
function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
async function getSSRUser() {
 const supabase = await supabaseServer();
 const { data: { user }, error } = await supabase.auth.getUser();
 if (error || !user) return { user: null as any, err: error?.message || "No user" };
 return { user };
}

function admin() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

export async function POST(req: Request) {
  try {
    const { user, err } = await getSSRUser();
    if (!user) return j(401, { ok: false, where: "auth", error: err || "No user" });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return j(400, { ok: false, where: "input", error: "file_not_found" });

    const orig = file.name || "profile.png";
    const ext = (orig.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const objectPath = `${user.id}/profile.${ext}`;
    const svc = admin();

    // 0) Bucket exists?
    const { data: bucket } = await svc.storage.getBucket(BUCKET);
    if (!bucket) return j(500, { ok: false, where: "bucket", error: "Bucket not found", bucket: BUCKET });

    // 1) Upload with service role (RLS bypass)
    const up = await svc.storage.from(BUCKET).upload(objectPath, file, {
      upsert: true,
      cacheControl: "3600",
      contentType: file.type || undefined,
    });
    if (up.error) return j(500, { ok: false, where: "storage.upload(service)", error: up.error.message, pathTried: objectPath });

    // 1b) Verify by listing folder
    const lst = await svc.storage.from(BUCKET).list(`${user.id}/`, { limit: 100 });
    const names = (lst.data || []).map(o => o.name);
    const exists = names.includes(`profile.${ext}`);

    // 2) Upsert profile row
    const upsert = await svc
      .from("worker_cv_profiles")
      .upsert({ worker_user_id: user.id, photo_object_path: objectPath }, { onConflict: "worker_user_id" });
    if (upsert.error) return j(500, { ok: false, where: "db.upsert(service)", error: upsert.error.message, pathSaved: objectPath });

    // 3) Signed URL
    const signed = await svc.storage.from(BUCKET).createSignedUrl(objectPath, 3600);

    return j(200, {
      ok: true,
      url: signed.data?.signedUrl || null,
      pathSaved: objectPath,
      verifiedInList: exists,
      folderList: names,
    });
  } catch (e: any) {
    return j(500, { ok: false, where: "exception", error: e?.message || String(e) });
  }
}

export async function DELETE() {
  try {
    const { user, err } = await getSSRUser();
    if (!user) return j(401, { ok: false, where: "auth", error: err || "No user" });

    const svc = admin();
    const lst = await svc.storage.from(BUCKET).list(`${user.id}/`, { limit: 100 });
    const candidates = (lst.data || []).filter(o => /^(profile|photo)\./i.test(o.name)).map(o => `${user.id}/${o.name}`);
    if (candidates.length) {
      const del = await svc.storage.from(BUCKET).remove(candidates);
      if (del.error) return j(500, { ok: false, where: "storage.delete(service)", error: del.error.message });
    }
    const upsert = await svc.from("worker_cv_profiles").upsert({ worker_user_id: user.id, photo_object_path: null }, { onConflict: "worker_user_id" });
    if (upsert.error) return j(500, { ok: false, where: "db.upsert(service)", error: upsert.error.message });
    return j(200, { ok: true, deleted: candidates });
  } catch (e: any) {
    return j(500, { ok: false, where: "exception", error: e?.message || String(e) });
  }
}
