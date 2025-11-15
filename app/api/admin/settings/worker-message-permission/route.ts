// app/api/admin/settings/worker-message-permission/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("supabase_service_role_missing");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// GET  -> tüm worker’lar: id, email, override, effective
export async function GET() {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin.from("v_worker_message_permission").select("*").order("email", { ascending: true });
    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "list_failed" }, { status: 500 });
  }
}

type PutBody = {
  workerId: string;
  permission: "inherit" | "allow" | "deny";
};

// PUT  -> tek worker override ayarı
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as PutBody;
    if (!body?.workerId || !["inherit", "allow", "deny"].includes(body?.permission)) {
      return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }

    const admin = getAdminClient();

    // Varsayılan strateji: "inherit" seçilirse kaydı sil (temiz DB)
    if (body.permission === "inherit") {
      const { error: delErr } = await admin.from("worker_message_prefs").delete().eq("worker_id", body.workerId);
      if (delErr) throw delErr;
    } else {
      const { error: upErr } = await admin
        .from("worker_message_prefs")
        .upsert(
          { worker_id: body.workerId, permission: body.permission, updated_at: new Date().toISOString() },
          { onConflict: "worker_id" }
        );
      if (upErr) throw upErr;
    }

    // güncel effective değeri geri verelim
    const { data: viewRow, error: viewErr } = await admin
      .from("v_worker_message_permission")
      .select("*")
      .eq("worker_id", body.workerId)
      .single();
    if (viewErr) throw viewErr;

    return NextResponse.json({ ok: true, data: viewRow });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "update_failed" }, { status: 500 });
  }
}
