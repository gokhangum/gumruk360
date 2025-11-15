// app/api/dashboard/balance/route.ts
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

export const dynamic = "force-dynamic"

async function supabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try { cookieStore.set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: any) {
          try { cookieStore.set({ name, value: "", ...options }) } catch {}
        }
      }
    }
  )
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function GET() {
  const trace: string[] = []
  try {
    const s = await supabaseServer()
    const { data: { user } } = await s.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ ok:false, error:"unauthorized" }, { status: 401 })
    }
    const uid = user.id
    trace.push(`uid=${uid}`)

    // USER BALANCE
    const { data: uRows, error: uErr } = await admin
      .from("credit_ledger")
      .select("change")
      .eq("scope_type", "user")
      .eq("scope_id", uid)
      .limit(50000)
    if (uErr) throw new Error(uErr.message)
    const user_balance = (uRows || []).reduce((acc, r:any) => acc + Number(r.change || 0), 0)

    // RESOLVE ORG (prefer owner, else any membership)
    const { data: memberships, error: mErr } = await admin
      .from("organization_members")
      .select("org_id, user_id, org_role")
      .eq("user_id", uid)
      .limit(1000)
    if (mErr) throw new Error(mErr.message)

    let org_id: string | null = null
    const owner = (memberships || []).find(m => m.org_role === "owner")
    if (owner?.org_id) org_id = owner.org_id
    else if ((memberships || []).length) org_id = memberships![0].org_id

    // ORG BALANCE
    let orgBalance: number | null = null
    if (org_id) {
      const { data: oRows, error: oErr } = await admin
        .from("credit_ledger")
        .select("change")
        .eq("scope_type", "org")
        .eq("scope_id", org_id)
        .limit(50000)
      if (oErr) throw new Error(oErr.message)
      orgBalance = (oRows || []).reduce((acc, r:any) => acc + Number(r.change || 0), 0)
    }

    return NextResponse.json({ ok:true, user_balance, orgBalance, org_id, trace })
  } catch (e:any) {
    trace.push(e?.message || "internal_error")
    return NextResponse.json({ ok:false, error:e?.message || "internal_error", trace }, { status: 500 })
  }
}
