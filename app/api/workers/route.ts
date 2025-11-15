
// app/api/workers/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  try {
	      // Host -> tenant_domains.host -> tenants.code
    const url = new URL(req.url);
    const rawHost = (req.headers.get("x-forwarded-host") || url.host || "").toLowerCase();
    const host = rawHost.split(":")[0]; // port'u at

    // 1) tenant_domains: host -> tenant_id
    const td = await supabaseAdmin
      .from("tenant_domains")
      .select("tenant_id")
      .eq("host", host)
      .maybeSingle();

    if (td.error) {
      return NextResponse.json({ ok: false, error: td.error.message }, { status: 400 });
    }
    if (!td.data?.tenant_id) {
      // Eşleşen host yoksa: boş liste
      return NextResponse.json([], { status: 200 });
    }

    // 2) tenants: tenant_id -> code
    const ten = await supabaseAdmin
      .from("tenants")
      .select("code")
      .eq("id", td.data.tenant_id)
      .maybeSingle();

    if (ten.error) {
      return NextResponse.json({ ok: false, error: ten.error.message }, { status: 400 });
    }
    const tenantCode = (ten.data?.code || "").trim();

     // A) Bu tenant'a ait profil id'leri (profiles.tenant_key = tenants.code)
    const p = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("tenant_key", tenantCode);
    if (p.error) {
      return NextResponse.json({ ok: false, error: p.error.message }, { status: 400 });
    }
    const ids = (p.data || []).map((r: any) => r.id).filter(Boolean);
    if (!ids.length) {
      return NextResponse.json([], { status: 200 });
    }

    // B) Worker CV'leri: sadece bu id'lere ait, adı dolu olanlar
    const { data, error } = await supabaseAdmin
      .from("worker_cv_profiles")
      .select("worker_user_id, display_name")
      .in("worker_user_id", ids)
      .not("display_name", "is", null)
      .neq("display_name", "")
      .order("display_name", { ascending: true })
      .limit(500);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    const rows = (data ?? []).map((r: any) => ({
      id: r.worker_user_id,
      name: r.display_name,
      email: null, // Bu endpointte e-posta gerekmiyor; sadece display_name gösteriyoruz.
    }));

    return NextResponse.json(rows, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "internal_error" }, { status: 500 });
  }
}
