// app/api/admin/credits/adjust/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: any) {
          try { cookieStore.set({ name, value: "", ...options }); } catch {}
        },
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // Admin kontrolü (varsa is_admin RPC)
    let isAdmin = false;
    try {
      const { data } = await supabase.rpc("is_admin");
      isAdmin = !!data;
    } catch {
      isAdmin = false;
    }
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
    }

    const form = await req.formData();
    let scope_type = String(form.get("scope_type") || "");
    let scope_id = String(form.get("scope_id") || "");
    const negate = String(form.get("negate") || "") === "1";
    const rawAmount = Number(form.get("amount") || 0);
    const member_user_id = String(form.get("member_user_id") || "");

    // Otomatik org_id çözümleme: corporate işlemlerinde scope_id boş gelirse organization_members'tan çek
    if (scope_type === "org" && !scope_id) {
      if (!member_user_id) {
        return NextResponse.json({ ok: false, error: "bad_request", detail: "missing_org_id_and_member_user_id" }, { status: 400 });
      }
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const { data: membership, error: memErr } = await admin
        .from("organization_members")
        .select("org_id")
        .eq("user_id", member_user_id)
        .limit(1)
        .maybeSingle();
      if (memErr) {
        return NextResponse.json({ ok: false, error: "org_lookup_failed", detail: memErr.message }, { status: 500 });
      }
      if (!membership?.org_id) {
        return NextResponse.json({ ok: false, error: "org_not_found_for_user", detail: member_user_id }, { status: 400 });
      }
      scope_id = membership.org_id;
    }

    if (!scope_type || !scope_id) {
      return NextResponse.json({ ok: false, error: "bad_request", detail: "missing_scope" }, { status: 400 });
    }
    if (!rawAmount || rawAmount < 0) {
      return NextResponse.json({ ok: false, error: "bad_request", detail: "amount_must_be_positive_integer" }, { status: 400 });
    }

    const amount = negate ? -Math.abs(rawAmount) : Math.abs(rawAmount);

    // service role ile insert
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const payload: any = {
      scope_type,
      scope_id,
      change: amount,
      reason: "manual_adjust",
      meta: {
        kind: negate ? "manual_decrease" : "manual_increase",
        scope_type,
        credits: Math.abs(amount),
        adjusted_by: auth.user.id,
        source: "admin_panel",
      },
    };

    const { error } = await admin.from("credit_ledger").insert(payload);
    if (error) {
      return NextResponse.json({ ok: false, error: "insert_failed", detail: error.message, code: error.code }, { status: 500 });
    }

    return NextResponse.json({ ok: true, scope_type, scope_id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "server_error", detail: e?.message ?? null }, { status: 500 });
  }
}
