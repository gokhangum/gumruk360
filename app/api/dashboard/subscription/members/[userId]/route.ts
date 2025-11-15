import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ userId: string }> }
) {

  try {
    const supabase = await supabaseServer();

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const { userId } = await ctx.params;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });
    }

    // Call RPC that safely bypasses RLS with owner checks
    const { data, error } = await supabase.rpc("rpc_org_member_remove", { p_target_user_id: userId });

    if (error) {
      // Map common errors to clear HTTP statuses
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("owner_required")) return NextResponse.json({ ok: false, error: "owner_required" }, { status: 403 });
      if (msg.includes("cannot_remove_self")) return NextResponse.json({ ok: false, error: "cannot_remove_self" }, { status: 400 });
      if (msg.includes("cannot_remove_owner")) return NextResponse.json({ ok: false, error: "cannot_remove_owner" }, { status: 400 });
      if (msg.includes("member_not_found")) return NextResponse.json({ ok: false, error: "member_not_found" }, { status: 404 });
      if (msg.includes("unauthorized")) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
      return NextResponse.json({ ok: false, error: "rpc_failed", detail: error.message }, { status: 500 });
    }

    if (data !== true) {
      return NextResponse.json({ ok: false, error: "unexpected_return" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "internal_error", detail: e?.message }, { status: 500 });
  }
}
