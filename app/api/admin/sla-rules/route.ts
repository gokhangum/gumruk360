import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data: rules, error: rulesErr } = await supabaseAdmin
    .from("sla_reminder_rules")
    .select("*")
    .order("minutes_before_sla", { ascending: true });

  if (rulesErr) {
    return NextResponse.json({ ok: false, error: rulesErr.message }, { status: 500 });
  }

  const { data: tenants, error: tenantsErr } = await supabaseAdmin
    .from("tenants")
    .select("id, primary_domain")
    .order("primary_domain", { ascending: true });

  if (tenantsErr) {
    return NextResponse.json({ ok: false, error: tenantsErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rules: rules ?? [], tenants: tenants ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const minutes = Number(body?.minutes_before_sla || 0);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return NextResponse.json(
        { ok: false, error: "Geçerli bir dakika değeri girin." },
        { status: 400 }
      );
    }

    const insert = {
      name: String(body?.name || "").trim() || null,
      tenant_id: body?.tenant_id || null,
      minutes_before_sla: minutes,
      send_to_assignee: !!body?.send_to_assignee,
      send_to_admins: !!body?.send_to_admins,
      allowed_question_statuses: Array.isArray(body?.allowed_question_statuses)
        ? body.allowed_question_statuses.map((s: any) => String(s))
        : ["approved"],
      allowed_answer_statuses: Array.isArray(body?.allowed_answer_statuses)
        ? body.allowed_answer_statuses.map((s: any) => String(s))
        : [],
      include_null_answer_status:
        typeof body?.include_null_answer_status === "boolean"
          ? body.include_null_answer_status
          : true,
      subject_template: String(body?.subject_template || "").trim() || "SLA hatırlatma",
      body_template:
        String(body?.body_template || "").trim() ||
        "“{{title}}” başlıklı soru için SLA süresinin dolmasına yaklaşık {{minutes}} dakika kaldı.",
      is_active: body?.is_active !== false,
    };

    const { data, error } = await supabaseAdmin
      .from("sla_reminder_rules")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rule: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body?.id as string | undefined;
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Güncellenecek kural id değeri gerekli." },
        { status: 400 }
      );
    }

    const patch: Record<string, any> = {};
    if (typeof body?.is_active === "boolean") {
      patch.is_active = body.is_active;
    }
    if (body?.name !== undefined) {
      patch.name = String(body.name || "").trim() || null;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json(
        { ok: false, error: "Güncellenecek bir alan verilmedi." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("sla_reminder_rules")
      .update(patch)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const url = req.nextUrl;
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Silinecek kural id değeri gerekli." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("sla_reminder_rules")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
