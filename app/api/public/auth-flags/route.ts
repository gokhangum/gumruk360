import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/public/auth-flags
 * Anon okunur: { ok:true, data:{ login_open, signup_open } }
 * (UI’miz düz JSON veya {ok:true,data} ikisini de destekliyor, ama burada {ok:true,data} döndürüyoruz.)
 *
 * Not: SQL’de v_auth_flags için anon SELECT policy verdik.
 * Burada anon key ile okuyup JSON döndürüyoruz.
 */
export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    if (!url || !anon) {
      return NextResponse.json({ ok: false, error: "supabase_env_missing" }, { status: 500 });
    }

    const sb = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await sb.from("v_auth_flags").select("*").single();


    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return new NextResponse(
      JSON.stringify({ ok: true, data }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "unknown_error" }, { status: 500 });
  }
}
