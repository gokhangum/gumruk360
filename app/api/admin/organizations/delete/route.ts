import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const form = await req.formData();
    const org_id = String(form.get("org_id") || "");
    if (!org_id) return NextResponse.redirect("/admin/users", { status: 303 });

    await supabaseAdmin.from("organizations").delete().eq("id", org_id);

    await supabaseAdmin.from("audit_logs").insert({
      action: "delete_org",
      resource_type: "organization",
      resource_id: org_id,
      event: "delete",
      actor_role: "admin",
    });

    return NextResponse.redirect("/admin/users", { status: 303 });
  } catch (e: any) {
   
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}