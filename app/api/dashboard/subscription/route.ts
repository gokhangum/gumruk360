// app/api/dashboard/subscription/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: any) { try { cookieStore.set({ name, value, ...options }); } catch {} },
        remove(name: string, options: any) { try { cookieStore.set({ name, value: "", ...options }); } catch {} },
      },
    }
  );
}

export async function GET() {
  const trace: any[] = [];
  try {
    const sb = await supabaseServer();
    const { data: userRes, error: uErr } = await sb.auth.getUser();
    if (uErr || !userRes?.user) {
      return NextResponse.json({ purchases: [], usage: [], members: [] }, { status: 200 });
    }
    const uid = userRes.user.id;

    // Resolve org (prefer owner)
    const { data: memberships, error: mErr } = await supabaseAdmin
      .from("organization_members")
      .select("org_id, user_id, org_role")
      .eq("user_id", uid)
      .limit(1000);
    if (mErr) throw new Error(mErr.message);
    const owner = (memberships || []).find(m => m.org_role === "owner");
    const org_id = owner?.org_id || (memberships?.[0]?.org_id ?? null);
    if (!org_id) {
      return NextResponse.json({ purchases: [], usage: [], members: [] }, { status: 200 });
    }
   let purchRows: any[] = [];
    let usageEnriched: any[] = [];

    if (owner) {
    // Purchases (org scope, positive changes, recent first)
    const { data: _purchRows, error: pErr } = await supabaseAdmin
      .from("credit_ledger")
      .select("id, change, created_at")
      .eq("scope_type", "org")
      .eq("scope_id", org_id)
      .gt("change", 0)
      .order("created_at", { ascending: false })
      .limit(200);
    if (pErr) throw new Error(pErr.message);
purchRows = _purchRows || [];
    // Usage (org scope, negative changes)
    const { data: usageRows, error: uLErr } = await supabaseAdmin
      .from("credit_ledger")
      .select("id, change, reason, created_at, question_id")
      .eq("scope_type", "org")
      .eq("scope_id", org_id)
      .lt("change", 0)
      .order("created_at", { ascending: false })
      .limit(500);
    if (uLErr) throw new Error(uLErr.message);

    // Enrich usage with question titles and asker names (org scope may include other users' questions)
    const uRows = usageRows || [];
     usageEnriched = uRows.map((r:any) => ({ ...r, question_title: null as string|null, asker_name: null as string|null }));


    const qids = Array.from(new Set(uRows.map((r:any) => r.question_id).filter(Boolean)));
    if (qids.length > 0) {
      const { data: qRows, error: qErr } = await supabaseAdmin
        .from("questions")
        .select("id, title, user_id")
        .in("id", qids as string[]);
      if (qErr) throw new Error(qErr.message);

      const qMap = new Map((qRows || []).map((q:any) => [q.id, { title: q.title ?? null, user_id: q.user_id ?? null }]));

      const uids = Array.from(new Set((qRows || []).map((q:any) => q.user_id).filter(Boolean)));
      let askerMap = new Map<string, string|null>();
      if (uids.length > 0) {
        const { data: profRows, error: pErr } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name")
          .in("id", uids as string[]);
        if (pErr) throw new Error(pErr.message);
        askerMap = new Map((profRows || []).map((p:any) => [p.id, p.full_name ?? null]));
      }

      usageEnriched = uRows.map((r:any) => {
        const q = r.question_id ? qMap.get(r.question_id) : undefined;
        const askerName = q?.user_id ? askerMap.get(q.user_id) ?? null : null;
        return { ...r, question_title: q?.title ?? null, asker_name: askerName };
      });
    }
 }
    // Members (join profiles to get email)
    const { data: memRows, error: memErr } = await supabaseAdmin
      .from("organization_members")
      .select("user_id, org_role, status")
      .eq("org_id", org_id)
      .order("org_role", { ascending: true })
      .limit(1000);
    if (memErr) throw new Error(memErr.message);

    let members: any[] = memRows || [];
    if (members.length) {
      const ids = members.map(m => m.user_id).filter(Boolean);
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const map = new Map((profs || []).map((p:any) => [p.id, p.email]));
      members = members.map(m => ({ ...m, email: map.get(m.user_id) || null }));
    }
return NextResponse.json({
  isOwner: !!owner,
  ...(owner ? {} : { reason: "not_owner" }),
  purchases: purchRows || [],
  usage: usageEnriched || [],
  members,
});
  } catch (e:any) {
    trace.push(e?.message || "internal_error");
    return NextResponse.json({ purchases: [], usage: [], members: [], trace }, { status: 200 });
  }
}