
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
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
   const cookieStore = await cookies();
 const ssr = createServerClient(
   requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
   {
  cookies: {
     get(name: string) {
      return cookieStore.get(name)?.value;
     },
     set(name: string, value: string, options: any) {
       cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: "", ...options });
      },
     },
   } as any
 );

  const { data: { user }, error } = await ssr.auth.getUser();
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

export async function GET() {
  try {
    const { user, err } = await getSSRUser();
    if (!user) return j(401, { ok: false, error: err || "No user" });

    const svc = admin();

    // 1) Önce DB'deki path'i al
    const prof = await svc
      .from("worker_cv_profiles")
      .select("photo_object_path")
      .eq("worker_user_id", user.id)
      .maybeSingle();

    let objectPath = prof.data?.photo_object_path || null;

    // 2) Yoksa klasörü listeleyip profile.* / photo.* ara
    if (!objectPath) {
      const list = await svc.storage.from(BUCKET).list(`${user.id}/`, { limit: 100 });
      const candidate = (list.data || []).find(o => /^(profile|photo)\./i.test(o.name));
      if (candidate) objectPath = `${user.id}/${candidate.name}`;
    }

    if (!objectPath) return j(200, { ok: true, url: null, reason: "no-object" });

    // 3) İmzalı URL üret
    const signed = await svc.storage.from(BUCKET).createSignedUrl(objectPath, 3600);
    if (signed.error) return j(200, { ok: true, url: null, reason: signed.error.message, path: objectPath });

    return j(200, { ok: true, url: signed.data?.signedUrl || null, path: objectPath });
  } catch (e: any) {
    return j(500, { ok: false, error: e?.message || String(e) });
  }
}
