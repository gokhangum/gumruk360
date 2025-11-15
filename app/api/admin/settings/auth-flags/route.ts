import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Ortak: cookie tabanlı Supabase server client */
async function getServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !anon) throw new Error("supabase_env_missing");

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: "", ...options, maxAge: 0 });
      }
    }
  });
}

/**
 * GET /api/admin/settings/auth-flags
 * Sadece admin: login_open & signup_open değerlerini JSON döndürür.
 * Her zaman JSON döndürür (redirect/HTML yok).
 */
export async function GET() {
  try {
    const sb = await getServerClient();

    const { data: { user }, error: userErr } = await sb.auth.getUser();
    if (userErr) {
      return NextResponse.json({ ok: false, error: userErr.message }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const { data: isAdmin, error: adminErr } = await sb.rpc("is_admin");
    if (adminErr) {
      return NextResponse.json({ ok: false, error: adminErr.message }, { status: 500 });
    }
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { data, error } = await sb.from("v_auth_flags").select("*").single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return new NextResponse(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0"
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "unknown_error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/settings/auth-flags
 * Body: { login_open: boolean, signup_open: boolean }
 * Sadece admin update edebilir; güncel değerleri döndürür.
 */
export async function POST(req: Request) {
  try {
    const sb = await getServerClient();

    const { data: { user }, error: userErr } = await sb.auth.getUser();
    if (userErr) {
      return NextResponse.json({ ok: false, error: userErr.message }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const { data: isAdmin, error: adminErr } = await sb.rpc("is_admin");
    if (adminErr) {
      return NextResponse.json({ ok: false, error: adminErr.message }, { status: 500 });
    }
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null as any);
    const login_open  = !!body?.login_open;
    const signup_open = !!body?.signup_open;

    const { error: updErr } = await sb.rpc("admin_set_auth_flags", {
      p_login_open: login_open,
      p_signup_open: signup_open
    });
    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    const { data, error } = await sb.from("v_auth_flags").select("*").single();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return new NextResponse(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0"
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "unknown_error" }, { status: 500 });
  }
}
