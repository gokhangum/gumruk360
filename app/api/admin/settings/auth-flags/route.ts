// app/api/admin/settings/auth-flags/route.ts
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { resolveTenantFromHost } from "@/lib/tenant";

async function getServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !anon) {
    throw new Error("supabase_env_missing");
  }

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
      },
    },
  });
}

/**
 * GET /api/admin/settings/auth-flags?tenant_code=tr|en|...
 * Sadece admin: login_open & signup_open değerlerini JSON döndürür.
 * tenant_code varsa onu, yoksa host’tan resolve edilen tenant’ı kullanır.
 */
export async function GET(req: Request) {
  try {
    const sb = await getServerClient();

    const {
      data: { user },
      error: userErr,
    } = await sb.auth.getUser();

    if (userErr) {
      return NextResponse.json(
        { ok: false, error: userErr.message },
        { status: 500 },
      );
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }

    const { data: isAdmin, error: adminErr } = await sb.rpc("is_admin");
    if (adminErr) {
      return NextResponse.json(
        { ok: false, error: adminErr.message },
        { status: 500 },
      );
    }
    if (!isAdmin) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 },
      );
    }

    const urlObj = new URL(req.url);
    const tenantCodeParam =
      urlObj.searchParams.get("tenant_code")?.trim() || null;

    let code: string;
    if (tenantCodeParam) {
      code = tenantCodeParam;
    } else {
      const hdrs = await headers();
      const host =
        hdrs.get("x-forwarded-host") ??
        hdrs.get("host") ??
        "";
      const resolved = resolveTenantFromHost(host);
      code = resolved.code;
    }

    // 1) Tenant bazlı kayıt
    const { data: tenantFlags, error: tenantErr } = await sb
      .from("tenant_auth_flags")
      .select("login_open, signup_open")
      .eq("tenant_code", code)
      .maybeSingle();

    if (tenantErr) {
      return NextResponse.json(
        { ok: false, error: tenantErr.message },
        { status: 500 },
      );
    }

    let data: { login_open: boolean; signup_open: boolean };

    if (tenantFlags) {
      data = {
        login_open: !!tenantFlags.login_open,
        signup_open: !!tenantFlags.signup_open,
      };
    } else {
      // Tenant kaydı yoksa global feature_flags('default') fallback'i
      const { data: globalFlags, error: globalErr } = await sb
        .from("feature_flags")
        .select("login_open, signup_open")
        .eq("id", "default")
        .single();

      if (globalErr) {
        return NextResponse.json(
          { ok: false, error: globalErr.message },
          { status: 500 },
        );
      }

      data = {
        login_open: !!globalFlags.login_open,
        signup_open: !!globalFlags.signup_open,
      };
    }

    return new NextResponse(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control":
          "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unknown_error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/settings/auth-flags?tenant_code=tr|en|...
 * Body: { login_open: boolean, signup_open: boolean, tenant_code?: string }
 * Sadece admin update edebilir; güncel değerleri döndürür.
 */
export async function POST(req: Request) {
  try {
    const sb = await getServerClient();

    const {
      data: { user },
      error: userErr,
    } = await sb.auth.getUser();

    if (userErr) {
      return NextResponse.json(
        { ok: false, error: userErr.message },
        { status: 500 },
      );
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }

    const { data: isAdmin, error: adminErr } = await sb.rpc("is_admin");
    if (adminErr) {
      return NextResponse.json(
        { ok: false, error: adminErr.message },
        { status: 500 },
      );
    }
    if (!isAdmin) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 },
      );
    }

    const urlObj = new URL(req.url);
    const tenantCodeParam =
      urlObj.searchParams.get("tenant_code")?.trim() || null;

    const body = await req.json().catch(() => null as any);
    const bodyTenantCode =
      body?.tenant_code && typeof body.tenant_code === "string"
        ? body.tenant_code.trim()
        : null;

    let code: string;
    if (bodyTenantCode) {
      code = bodyTenantCode;
    } else if (tenantCodeParam) {
      code = tenantCodeParam;
    } else {
      const hdrs = await headers();
      const host =
        hdrs.get("x-forwarded-host") ??
        hdrs.get("host") ??
        "";
      const resolved = resolveTenantFromHost(host);
      code = resolved.code;
    }

    const login_open = !!body?.login_open;
    const signup_open = !!body?.signup_open;

    const { error: updErr } = await sb
      .from("tenant_auth_flags")
      .upsert(
        {
          tenant_code: code,
          login_open,
          signup_open,
          updated_by: user.id,
        },
        { onConflict: "tenant_code" },
      );

    if (updErr) {
      return NextResponse.json(
        { ok: false, error: updErr.message },
        { status: 500 },
      );
    }

    const data = { login_open, signup_open };

    return new NextResponse(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control":
          "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unknown_error" },
      { status: 500 },
    );
  }
}
