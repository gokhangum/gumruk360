// app/api/public/auth-flags/route.ts
import { NextResponse } from "next/server";
 import { headers } from "next/headers";
 import { createClient } from "@supabase/supabase-js";
 import { resolveTenantFromHost } from "@/lib/tenant";
 
 /**
  * GET /api/public/auth-flags
 * Anon okunur: { ok:true, data:{ login_open, signup_open } }
 * (UI’miz düz JSON veya {ok:true,data} ikisini de destekliyor, ama burada {ok:true,data} döndürüyoruz.)
 *
 * Mantık:
 *  - Önce tenant_auth_flags(tenant_code = 'tr' | 'en') okunur.
  *  - Kayıt yoksa global feature_flags(id='default') fallback olarak kullanılır.
 */
 export async function GET() {
   try {
     const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
   const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
     if (!url || !anon) {
       return NextResponse.json(
        { ok: false, error: "supabase_env_missing" },
         { status: 500 }
     );
    }

      const h = await headers();
     const host =
       h.get("x-forwarded-host") ??
       h.get("host") ??
       "";
     const { code } = resolveTenantFromHost(host);

   const sb = createClient(url, anon, {
      auth: {
        autoRefreshToken: false,
         persistSession: false,
        detectSessionInUrl: false,
       },
    });

    // 1) Tenant bazlı kayıt
     const { data: tenantFlags, error: tenantErr } = await sb
     .from("tenant_auth_flags")
      .select("login_open, signup_open")
     .eq("tenant_code", code)
    .maybeSingle();

    if (tenantErr) {
     // Hata olursa loglayıp global fallback'e geçiyoruz
      console.error("tenant_auth_flags error", tenantErr);
    }

   let login_open: boolean;
    let signup_open: boolean;

  if (tenantFlags) {
      login_open = !!tenantFlags.login_open;
    signup_open = !!tenantFlags.signup_open;
   } else {
     // 2) Global feature_flags('default') fallback
      const { data: globalFlags, error: globalErr } = await sb
        .from("feature_flags")
        .select("login_open, signup_open")
       .eq("id", "default")
       .single();

     if (globalErr) {
       return NextResponse.json(
         { ok: false, error: globalErr.message },
          { status: 500 }
       );
      }

      login_open = !!globalFlags.login_open;
    signup_open = !!globalFlags.signup_open;
   }

    const data = { login_open, signup_open };

  return new NextResponse(JSON.stringify({ ok: true, data }), {
     status: 200,
    headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
     },
    });
  } catch (e: any) {
    console.error("public/auth-flags error", e);
   return NextResponse.json(
      { ok: false, error: e?.message || "unknown_error" },
      { status: 500 }
    );
   }
 }
