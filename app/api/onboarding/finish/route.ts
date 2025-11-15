/* app/api/onboarding/finish/route.ts
 * After email confirmation, finalize profile and organization (idempotent).
 * - Fill profiles.name from user metadata.full_name if empty.
 * - If account_type=corporate or organization_name exists and user is not in any active org,
 *   create an organization via public.rpc_create_org(name, tax_id) using service role.
 * Keeps the email flow intact.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    // SSR client with user session (for reading auth user & profiles under RLS if allowed)
    const cookieStore = await cookies();
    const supabase = createServerClient(
      requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            // no-op (Route Handlers cannot mutate response cookies via this helper safely)
          },
          remove(name: string, options: any) {
            // no-op
          },
        },
      }
    );

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    const user = userRes.user;
    const uid = user.id;
    const meta = (user.user_metadata || {}) as any;
    const fullName: string | null = (meta.full_name || "").trim() || null;
    const accountType: string = (meta.account_type || "individual").toString();
    const orgName: string | null = (meta.organization_name || "").trim() || null;

    // Admin client for idempotent cross-table ops (bypass RLS safely)
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(
      requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1) Ensure profiles.name is filled from metadata if empty
    try {
      const { data: prof } = await admin
        .from("profiles")
        .select("id,name")
        .eq("id", uid)
        .single();
      if (prof && (!prof.name || prof.name.trim() === "") && fullName) {
        await admin.from("profiles").update({ name: fullName }).eq("id", uid);
      }
    } catch {}

    // 2) If corporate or has orgName → ensure membership exists (idempotent)
    if (accountType === "corporate" || orgName) {
      // Already a member?
      const { data: hasMem } = await admin
        .from("organization_members")
        .select("id,organization_id,status")
        .eq("user_id", uid)
        .in("status", ["active", "owner", "admin"])
        .limit(1);
      const alreadyMember = Array.isArray(hasMem) && hasMem.length > 0;

      if (!alreadyMember) {
        const finalOrgName = orgName || (fullName ? `${fullName} - Company` : "New Organization");
        // Call SQL function: public.rpc_create_org(name, tax_id)
        const { error: rpcErr } = await admin.rpc("rpc_create_org", { name: finalOrgName, tax_id: null });
        if (rpcErr) {
          // if function signature different, return explicit error for quick diagnosis
          return NextResponse.json({ ok: false, error: `rpc_create_org_failed: ${rpcErr.message}` }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "unexpected_error" }, { status: 500 });
  }
}
