
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// server-authenticated client (reads user's session from cookies)

async function supabaseServer() {
  const cookieStore = await cookies();
  const client = createServerClient(URL, ANON, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        // Next.js app router cookies are immutable on read; no-op set to satisfy interface
      },
      remove(name: string, options: any) {
        // no-op remove
      },
    },
  });
  return client as any;
}


// admin client for privileged reads
const admin = createClient(URL, SRK, { auth: { persistSession: false, autoRefreshToken: false } });

export async function GET() {
  try {
    const sb = await supabaseServer();
    const { data: userRes, error: userErr } = await sb.auth.getUser();
    if (userErr) throw new Error(userErr.message);
    const uid = userRes?.user?.id;
    if (!uid) return NextResponse.json({ ok:false, error:"unauthorized" }, { status: 401 });

    // Find active owner org for this user
    const { data: ownerRow, error: omErr } = await admin
      .from("organization_members")
      .select("org_id")
      .eq("user_id", uid)
      .eq("org_role", "owner")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (omErr) throw new Error(omErr.message);
    const org_id = ownerRow?.org_id;
    if (!org_id) return NextResponse.json({ ok:false, error:"org_not_found" }, { status: 404 });

    // Usage rows (negative changes) for org
    const { data: usageRows, error: uErr } = await admin
      .from("credit_ledger")
      .select("id, change, reason, created_at, question_id")
      .eq("scope_type", "org")
      .eq("scope_id", org_id)
      .lt("change", 0)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (uErr) throw new Error(uErr.message);

    // Enrich titles and asker names
    const uRows = usageRows || [];
    const qids = Array.from(new Set(uRows.map((r:any) => r.question_id).filter(Boolean)));
    let titleByQ = new Map<string, { title: string|null, user_id: string|null }>();
    let nameByU = new Map<string, string|null>();
    if (qids.length > 0) {
      const { data: qRows, error: qErr } = await admin
        .from("questions")
        .select("id, title, user_id")
        .in("id", qids as string[]);
      if (qErr) throw new Error(qErr.message);
      titleByQ = new Map((qRows || []).map((q:any) => [q.id, { title: q.title ?? null, user_id: q.user_id ?? null }]));
      const uids = Array.from(new Set((qRows || []).map((q:any) => q.user_id).filter(Boolean)));
      if (uids.length > 0) {
        const { data: profRows, error: pErr } = await admin
          .from("profiles")
          .select("id, full_name")
          .in("id", uids as string[]);
        if (pErr) throw new Error(pErr.message);
        nameByU = new Map((profRows || []).map((p:any) => [p.id, p.full_name ?? null]));
      }
    }

    const aoa: any[][] = [["Credit", "Question Title", "Full Name", "Date"]];
    for (const r of uRows) {
      const q = r.question_id ? titleByQ.get(r.question_id) : undefined;
      const asker = q?.user_id ? (nameByU.get(q.user_id) ?? null) : null;
      aoa.push([String(-Math.abs(Number(r.change))), q?.title ?? "", asker ?? "", new Date(r.created_at).toLocaleString("tr-TR")]);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, "Kullanim");
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="subscription-usage.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:"export_failed", detail: e?.message || String(e) }, { status: 500 });
  }
}
