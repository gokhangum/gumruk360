// app/api/admin/users/export/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type Billing = {
  user_id?: string | null;
  org_id?: string | null;
  full_name?: string | null;
  company_name?: string | null;
  address_line?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  phone_dial_code?: string | null;
};

type IndividualRow = {
  profile: Profile;
  billing: Billing | null;
  payments_total_cents: number;
  user_balance: number;
  meta_phone?: string | null;
  meta_company?: string | null;
};

type CorporateUserRow = {
  profile: Profile;
  billing: Billing | null;
  payments_total_cents: number;
  org_balance: number;
  org_id: string | null;
  meta_phone?: string | null;
  meta_company?: string | null;
};

const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const adminClient = createClient(URL, SRK, { auth: { persistSession: false, autoRefreshToken: false } });

const okStatuses = new Set(["paid","success","succeeded","completed","authorized","captured","ok"]);

function centsFromOrder(row: any): number {
  const ac = Number(row?.amount_cents);
  if (Number.isFinite(ac) && ac > 0) return ac;
  const atl = row?.amount_tl != null ? Number(row.amount_tl) : null;
  if (Number.isFinite(atl) && atl! > 0) return Math.round(atl! * 100);
  const a = Number(row?.amount);
  if (Number.isFinite(a) && a > 0) return Math.round(a * 100);
  return 0;
}
function orderIsPaid(row: any): boolean {
  const s1 = String(row?.status || "").toLowerCase();
  const s2 = String(row?.payment_status || "").toLowerCase();
  const paidFlag = okStatuses.has(s1) || okStatuses.has(s2);
  const hasPaidAt = !!row?.paid_at;
  return paidFlag || hasPaidAt;
}

function composeAddress(b?: Billing | null): string {
  if (!b) return "-";
  const parts = [b.address_line, b.city, b.country].filter((x) => !!x && String(x).trim().length);
  return parts.length ? parts.join(", ") : "-";
}
function composePhone(metaPhone?: string | null, b?: Billing | null): string {
  if (metaPhone && metaPhone.trim().length) return metaPhone;
  if (!b) return "-";
  const dial = b.phone_dial_code ? `${b.phone_dial_code} ` : "";
  return b.phone ? `${dial}${b.phone}` : "-";
}
function formatTRYfromCents(cents: number): number {
  const n = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  const liraInt = Math.floor(n / 10000);
  return liraInt;
}

async function listUsersByAccountType() {
  const admin = createClient(URL, SRK, { auth: { autoRefreshToken: false, persistSession: false } });
  let page = 1;
  const perPage = 1000;
  const individualIds = new Set<string>();
  const corporateIds = new Set<string>();
  const emailById = new Map<string, string | null>();
  const metaPhoneById = new Map<string, string | null>();
  const metaCompanyById = new Map<string, string | null>();
  // @ts-ignore
  while (true) {
    // @ts-ignore
   const res = await admin.auth.admin.listUsers({ page, perPage });
    const users = (res?.data?.users ?? []) as any[];
    if (!users.length) break;
    for (const u of users) {
     const meta = (u?.user_metadata || u?.raw_user_meta_data || {}) as any;
      const accType = (meta?.account_type || meta?.accountType || "").toString().toLowerCase();

      emailById.set(u.id, u.email ?? null);
      metaPhoneById.set(u.id, (meta?.phone ?? null) as any);
      metaCompanyById.set(u.id, (meta?.company ?? null) as any);
      if (accType === "corporate") corporateIds.add(u.id);
      else individualIds.add(u.id);
    }
   page += 1;
    if (users.length < perPage) break;
  }

  return { individualIds, corporateIds, emailById, metaPhoneById, metaCompanyById };
}

async function getIndividuals(idList: string[], emailById: Map<string, string | null>, metaPhoneById: Map<string, string | null>, metaCompanyById: Map<string, string | null>): Promise<IndividualRow[]> {
  const { data: profiles } = await adminClient.from("profiles").select("id, full_name, email").in("id", idList).limit(5000);
  const { data: billingRows } = await adminClient.from("billing_profiles").select("user_id, full_name, company_name, address_line, city, country, phone, phone_dial_code").in("user_id", idList).limit(5000);
  const billingByUser = new Map<string, Billing>(); (billingRows ?? []).forEach((b: any) => { if (b.user_id) billingByUser.set(b.user_id, b); });
  const { data: orders } = await adminClient.from("orders").select("user_id, amount, amount_cents, amount_tl, status, payment_status, paid_at").in("user_id", idList).limit(50000);
  const payCentsByUser = new Map<string, number>(); (orders ?? []).forEach((o: any) => { if (!o?.user_id) return; if (!orderIsPaid(o)) return; const cents = centsFromOrder(o); if (cents <= 0) return; payCentsByUser.set(o.user_id, (payCentsByUser.get(o.user_id) ?? 0) + cents); });
  const { data: userLedger } = await adminClient.from("credit_ledger").select("scope_type, scope_id, change").eq("scope_type", "user").in("scope_id", idList).limit(50000);
  const balanceByUser = new Map<string, number>(); (userLedger ?? []).forEach((row: any) => { if (row?.scope_type !== "user") return; const id = row?.scope_id; const ch = Number(row?.change ?? 0); if (!id || !Number.isFinite(ch)) return; balanceByUser.set(id, (balanceByUser.get(id) ?? 0) + ch); });
  return (profiles ?? []).map((prof: any) => ({
    profile: { ...prof, email: prof?.email ?? emailById.get(prof.id) ?? null },
    billing: billingByUser.get(prof.id) ?? null,
    payments_total_cents: payCentsByUser.get(prof.id) ?? 0,
    user_balance: balanceByUser.get(prof.id) ?? 0,
    meta_phone: metaPhoneById.get(prof.id) ?? null,
    meta_company: metaCompanyById.get(prof.id) ?? null,
  }));
}

async function getCorporateUsers(idList: string[], emailById: Map<string, string | null>, metaPhoneById: Map<string, string | null>, metaCompanyById: Map<string, string | null>): Promise<CorporateUserRow[]> {
  const { data: profiles } = await adminClient.from("profiles").select("id, full_name, email").in("id", idList).limit(5000);
  const { data: billingRows } = await adminClient.from("billing_profiles").select("user_id, full_name, company_name, address_line, city, country, phone, phone_dial_code").in("user_id", idList).limit(5000);
  const billingByUser = new Map<string, Billing>(); (billingRows ?? []).forEach((b: any) => { if (b.user_id) billingByUser.set(b.user_id, b); });
  const { data: orders } = await adminClient.from("orders").select("user_id, amount, amount_cents, amount_tl, status, payment_status, paid_at").in("user_id", idList).limit(50000);
  const payCentsByUser = new Map<string, number>(); (orders ?? []).forEach((o: any) => { if (!o?.user_id) return; if (!orderIsPaid(o)) return; const cents = centsFromOrder(o); if (cents <= 0) return; payCentsByUser.set(o.user_id, (payCentsByUser.get(o.user_id) ?? 0) + cents); });
  const { data: memberships } = await adminClient.from("organization_members").select("org_id, user_id").in("user_id", idList).limit(10000);
  const firstOrgByUser = new Map<string, string>(); (memberships ?? []).forEach((m: any) => { if (!m?.user_id || !m?.org_id) return; if (!firstOrgByUser.has(m.user_id)) firstOrgByUser.set(m.user_id, m.org_id); });
  const orgIds = Array.from(new Set(Array.from(firstOrgByUser.values()).filter(Boolean)));
  const orgBalanceByOrg = new Map<string, number>();
  if (orgIds.length) {
    const { data: orgLedger } = await adminClient.from("credit_ledger").select("scope_type, scope_id, change").eq("scope_type", "org").in("scope_id", orgIds).limit(50000);
    (orgLedger ?? []).forEach((row: any) => { if (row?.scope_type !== "org") return; const id = row?.scope_id; const ch = Number(row?.change ?? 0); if (!id || !Number.isFinite(ch)) return; orgBalanceByOrg.set(id, (orgBalanceByOrg.get(id) ?? 0) + ch); });
  }
  return (profiles ?? []).map((prof: any) => {
    const org_id = firstOrgByUser.get(prof.id) ?? null;
    return {
      profile: { ...prof, email: prof?.email ?? emailById.get(prof.id) ?? null },
      billing: billingByUser.get(prof.id) ?? null,
      payments_total_cents: payCentsByUser.get(prof.id) ?? 0,
      org_id,
      org_balance: org_id ? (orgBalanceByOrg.get(org_id) ?? 0) : 0,
      meta_phone: metaPhoneById.get(prof.id) ?? null,
      meta_company: metaCompanyById.get(prof.id) ?? null,
    };
  });
}

function composeExcelRows(tab: "users" | "corporates", rows: IndividualRow[] | CorporateUserRow[]) {
  if (tab === "users") {
    const header = ["ID","Ad Soyad","E-posta","Tel","Ödeme Toplamı (TL)","Fatura Adresi","Kredi Bakiyesi"];
    const data = (rows as IndividualRow[]).map((r) => [
      r.profile.id,
      r.billing?.full_name ?? r.profile.full_name ?? "-",
      r.profile.email ?? "-",
      composePhone(r.meta_phone, r.billing),
      formatTRYfromCents(r.payments_total_cents),
      composeAddress(r.billing),
      r.user_balance,
    ]);
    return [header, ...data];
  } else {
    const header = ["ID","Firma Adı","E-posta","Tel","Fatura Adresi","Ödeme Toplamı (TL)","Kredi Bakiyesi"];
    const data = (rows as CorporateUserRow[]).map((r) => [
      r.profile.id,
      r.billing?.company_name ?? r.meta_company ?? "-",
      r.profile.email ?? "-",
      composePhone(r.meta_phone, r.billing),
      composeAddress(r.billing),
      formatTRYfromCents(r.payments_total_cents),
      r.org_balance,
    ]);
    return [header, ...data];
  }
}

function applyFilterSort<T extends IndividualRow | CorporateUserRow>(
  rows: T[],
  tab: "users" | "corporates",
  q?: string | null,
  sort?: string | null,
  dir?: string | null
): T[] {
  let r = rows;
  const term = (q || "").trim().toLowerCase();
  if (term) {
    r = r.filter((x: any) => {
      const phone = composePhone(x.meta_phone, x.billing);
      const addr = composeAddress(x.billing);
      const name = tab === "users" ? (x.billing?.full_name || x.profile.full_name || "") : (x.billing?.company_name || x.meta_company || "");
      const email = x.profile.email || "";
      const hay = [x.profile.id, name, email, phone, addr].join(" ").toLowerCase();
      return hay.includes(term);
    });
  }
  const direction = dir === "desc" ? -1 : 1;
  const s = (sort || "").toLowerCase();
  r = [...r].sort((a: any, b: any) => {
    const by = (aVal: any, bVal: any) => (aVal > bVal ? direction : aVal < bVal ? -direction : 0);
    if (tab === "users") {
      if (s === "name") return by((a.billing?.full_name || a.profile.full_name || ""), (b.billing?.full_name || b.profile.full_name || ""));
      if (s === "email") return by((a.profile.email || ""), (b.profile.email || ""));
      if (s === "odeme") return by((a.payments_total_cents || 0), (b.payments_total_cents || 0));
      if (s === "bakiye") return by((a.user_balance || 0), (b.user_balance || 0));
      return by(a.profile.id, b.profile.id);
    } else {
      if (s === "firma") return by((a.billing?.company_name || a.meta_company || ""), (b.billing?.company_name || b.meta_company || ""));
      if (s === "email") return by((a.profile.email || ""), (b.profile.email || ""));
      if (s === "odeme") return by((a.payments_total_cents || 0), (b.payments_total_cents || 0));
      if (s === "bakiye") return by((a.org_balance || 0), (b.org_balance || 0));
      return by(a.profile.id, b.profile.id);
    }
  });
  return r;
}

export async function GET(req: NextRequest) {
  try {
    // Dynamic import on the server, with CJS/ESM interop
    const XLSXmod = await import("xlsx");
    const XLSX: any = (XLSXmod as any).default ?? XLSXmod;

    const { searchParams } = req.nextUrl;
    const tab = (searchParams.get("tab") === "corporates" ? "corporates" : "users") as "users" | "corporates";
    const q = searchParams.get("q") || "";
    const sort = searchParams.get("sort") || "";
    const dir = (searchParams.get("dir") === "desc" ? "desc" : "asc") as "asc" | "desc";

    const { individualIds, corporateIds, emailById, metaPhoneById, metaCompanyById } = await listUsersByAccountType();
    let rows: any[] = [];
    if (tab === "users") {
      rows = await getIndividuals(Array.from(individualIds), emailById, metaPhoneById, metaCompanyById);
    } else {
      rows = await getCorporateUsers(Array.from(corporateIds), emailById, metaPhoneById, metaCompanyById);
    }
    const filtered = applyFilterSort(rows, tab, q, sort, dir);
    const aoa = composeExcelRows(tab, filtered);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, tab === "users" ? "Users" : "Corporates");
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="admin-${tab}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "export_failed", detail: e?.message || String(e) }, { status: 500 });
  }
}
