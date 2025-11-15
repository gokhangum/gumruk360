import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const form = await req.formData();
    const user_id = String(form.get("user_id") || "");
    if (!user_id) return NextResponse.redirect("/admin/users", { status: 303 });

    // delete auth user
    await supabaseAdmin.auth.admin.deleteUser(user_id);

    await supabaseAdmin.from("audit_logs").insert({
      action: "delete_user",
      resource_type: "user",
      resource_id: user_id,
      event: "delete",
      actor_role: "admin",
    });

    return NextResponse.redirect("/admin/users", { status: 303 });
  } catch (e: any) {
    
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}