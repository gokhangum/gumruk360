import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

function pick<T extends Record<string, any>>(obj: T, keys: (keyof T)[]) {
  const out: Partial<T> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: any) {
          try { cookieStore.set({ name, value: "", ...options }); } catch {}
        },
      },
    }
  );
}

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return NextResponse.json({ ok:false, error:"auth_required" }, { status: 401 });

    const { data, error } = await supabase
      .from("billing_profiles")
      .select("is_corporate, full_name, company_name, tax_number, tax_office, address_line, city, country, phone_dial_code, phone, e_invoice")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ ok:false, error:"db_error", detail:error.message }, { status:500 });

    return NextResponse.json({ ok:true, data: data ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:"server_error", detail:String(e?.message ?? e) }, { status:500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return NextResponse.json({ ok:false, error:"auth_required" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const allowed = pick(body, [
      "is_corporate",
      "full_name",
      "company_name",
      "tax_number",
      "tax_office",
      "address_line",
      "city",
      "country",
      "phone_dial_code",
      "phone",
      "e_invoice",
    ] as const);

    const row = {
      user_id: user.id,
      is_corporate: !!allowed.is_corporate,
      full_name: (allowed.full_name ?? "").trim() || null,
      company_name: (allowed.company_name ?? "").trim() || null,
      tax_number: (allowed.tax_number ?? "").trim() || null,
      tax_office: (allowed.tax_office ?? "").trim() || null,
      address_line: (allowed.address_line ?? "").trim() || null,
      city: (allowed.city ?? "").trim() || null,
      country: (allowed.country ?? "").trim() || null,
      phone_dial_code: (allowed.phone_dial_code ?? "+90").trim() || "+90",
      phone: (allowed.phone ?? "").trim() || null,
      e_invoice: !!allowed.e_invoice,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("billing_profiles")
      .upsert(row, { onConflict: "user_id" })
      .select("is_corporate, full_name, company_name, tax_number, tax_office, address_line, city, country, phone_dial_code, phone, e_invoice")
      .maybeSingle();

    if (error) return NextResponse.json({ ok:false, error:"db_error", detail:error.message }, { status:500 });

    try {
      await supabase.from("audit_logs").insert({
        id: crypto.randomUUID?.() ?? undefined,
        action: "billing_profile.upsert",
        user_id: user.id,
        resource_type: "billing_profile",
        resource_id: user.id,
        payload: row,
        created_at: new Date().toISOString(),
      } as any);
    } catch {}

    return NextResponse.json({ ok:true, data });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:"server_error", detail:String(e?.message ?? e) }, { status:500 });
  }
}
