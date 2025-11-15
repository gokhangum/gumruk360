import { headers, cookies } from 'next/headers'
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function adminSecretOk(): Promise<boolean> {
  const cookieStore = await cookies();
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  const fromHeader = (await headers()).get("x-admin-secret");
  if (fromHeader && fromHeader === expected) return true;
  const fromCookie = cookieStore.get("admin_secret")?.value;
  if (fromCookie && fromCookie === expected) return true;
  return false;
}

async function adminRoleOk(): Promise<boolean> {
  try {
    const reqCookies = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) { return reqCookies.get(name)?.value; },
          set() {},
          remove() {},
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return (profile as any)?.role === "admin";
  } catch {
    return false;
  }
}

async function assertAdmin() {
  if (await adminSecretOk()) return;
  if (await adminRoleOk()) return;
  throw Object.assign(new Error("unauthorized"), { status: 401 });
}

export async function GET() {
  try {
    await assertAdmin();

    // 1) Worker profilleri çek (email kolonu yok → sadece id)
    const { data: workers, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role","worker");

    if (error) throw error;

    // 2) Her ID için auth'tan email getir (service role ile)
    const enriched = await Promise.all(
      (workers || []).map(async (w: any) => {
        try {
          const r = await supabaseAdmin.auth.admin.getUserById(w.id);
          const email = r?.data?.user?.email || "(email yok)";
          return { id: w.id, email };
        } catch {
          return { id: w.id, email: "(email yok)" };
        }
      })
    );

    return NextResponse.json({ ok: true, data: enriched });
  } catch (err: any) {
    const status = err?.status || 500;
    return NextResponse.json({ ok: false, error: err?.message || "server_error" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await assertAdmin();

    const body = await req.json().catch(() => ({}));
    const rawEmail = body?.email ? String(body.email).trim() : "";
    const rawId = body?.id ? String(body.id).trim() : "";
    const role = String(body?.role || "").trim().toLowerCase();

    if (!["worker","user"].includes(role)) {
      return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
    }
    if (!rawEmail && !rawId) {
      return NextResponse.json({ ok: false, error: "email_or_id_required" }, { status: 400 });
    }
    if (rawEmail && !isEmail(rawEmail)) {
      return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }

    // ID'yi elde et
    let userId: string | null = rawId || null;
   if (!userId && rawEmail) {
      try {
       const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("email", rawEmail)
          .maybeSingle();
         userId = prof?.id ?? null;
       } catch {
        userId = null;
     }
    }

    if (role === "worker") {
      if (userId) {
        // Kayıtlı kullanıcı: ID üzerinden worker yap
        const up = await supabaseAdmin
          .from("profiles")
          .upsert({ id: userId, role: "worker" }, { onConflict: "id" })
          .select("id")
          .maybeSingle();
        if (up.error) throw up.error;

        if (rawEmail) {
          await supabaseAdmin.from("worker_allowlist").delete().ilike("email", rawEmail);
        }
        return NextResponse.json({ ok: true, mode: "updated_profile_by_id" });
      } else {
        // Kayıtlı değil: allowlist'e ekle
        const ins = await supabaseAdmin
          .from("worker_allowlist")
          .upsert({ email: rawEmail })
          .select("email")
          .maybeSingle();
        if (ins.error) throw ins.error;
        return NextResponse.json({ ok: true, mode: "allowlisted" });
      }
    } else {
      // role === "user"
      if (userId) {
        const upd = await supabaseAdmin
          .from("profiles")
          .update({ role: "user" })
          .eq("id", userId)
          .select("id")
          .maybeSingle();
        if (upd.error) throw upd.error;
      }
      if (rawEmail) {
        await supabaseAdmin.from("worker_allowlist").delete().ilike("email", rawEmail);
      }
      return NextResponse.json({ ok: true, mode: "demoted" });
    }
  } catch (err: any) {
    const status = err?.status || 500;
    return NextResponse.json({ ok: false, error: err?.message || "server_error" }, { status });
  }
}