// app/admin/users/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "../../../lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import React from "react";

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
  payments_total_cents: number; // cents
  user_balance: number; // credits
  meta_phone?: string | null;
  meta_company?: string | null;
};

type CorporateUserRow = {
  profile: Profile;
  billing: Billing | null;
  payments_total_cents: number; // cents
  org_balance: number; // credits
  org_id: string | null;
  meta_phone?: string | null;
  meta_company?: string | null;
};

const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SRK || "MISSING_SRK",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Convert aggregated "cents" to whole TL after dropping two extra zeros
function formatTRYfromCents(cents: number): string {
  const n = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  const liraInt = Math.floor(n / 10000);
  return `${liraInt} TL`;
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

async function adminSelect(table: string, builder: any) {
  try {
    const { data, error } = await builder;

    return { data, error };
  } catch (e: any) {
    // eslint-disable-next-line no-console
    
    return { data: null, error: e };
  }
}

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

async function listUsersByAccountType(): Promise<{
  individualIds: Set<string>;
  corporateIds: Set<string>;
  emailById: Map<string, string | null>;
  metaPhoneById: Map<string, string | null>;
  metaCompanyById: Map<string, string | null>;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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
  const users = ((res as any)?.data?.users ?? (res as any)?.users) || [];

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
    const total = ( (res as any)?.data?.total ) as number | undefined;
    if (total && page > Math.ceil(total / perPage)) break;
    if (!total && users.length < perPage) break;
  }

  return { individualIds, corporateIds, emailById, metaPhoneById, metaCompanyById };
}

async function getIndividuals(
  supabase: any,
  individualIds: Set<string>,
  emailById: Map<string, string | null>,
  metaPhoneById: Map<string, string | null>,
  metaCompanyById: Map<string, string | null>
): Promise<IndividualRow[]> {
  if (individualIds.size === 0) return [];

  const idList = Array.from(individualIds);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", idList)
    .limit(5000);

  const { data: billingRows } = await adminSelect(
    "billing_profiles",
    adminClient
      .from("billing_profiles")
      .select("user_id, full_name, company_name, address_line, city, country, phone, phone_dial_code")
      .in("user_id", idList)
      .limit(5000)
  );
  const billingByUser = new Map<string, Billing>();
  (billingRows ?? []).forEach((b: Billing) => {
    if (b.user_id) billingByUser.set(b.user_id, b);
  });

  // ORDERS total per user (paid only)
  const { data: orders } = await adminSelect(
    "orders",
    adminClient
      .from("orders")
      .select("user_id, amount, amount_cents, amount_tl, status, payment_status, paid_at")
      .in("user_id", idList)
      .limit(50000)
  );
  const payCentsByUser = new Map<string, number>();
  (orders ?? []).forEach((o: any) => {
    if (!o?.user_id) return;
    if (!orderIsPaid(o)) return;
    const cents = centsFromOrder(o);
    if (cents <= 0) return;
    const prev = payCentsByUser.get(o.user_id) ?? 0;
    payCentsByUser.set(o.user_id, prev + cents);
  });

  // User credit balance
  const { data: userLedger } = await adminSelect(
    "credit_ledger(user)",
    adminClient
      .from("credit_ledger")
      .select("scope_type, scope_id, change")
      .eq("scope_type", "user")
      .in("scope_id", idList)
      .limit(50000)
  );
  const balanceByUser = new Map<string, number>();
  (userLedger ?? []).forEach((row: any) => {
    if (row?.scope_type !== "user") return;
    const id = row?.scope_id;
    const ch = Number(row?.change ?? 0);
    if (!id || !Number.isFinite(ch)) return;
    balanceByUser.set(id, (balanceByUser.get(id) ?? 0) + ch);
  });

  const rows: IndividualRow[] = (profiles ?? []).map((prof: Profile) => {
    const billing = prof?.id ? billingByUser.get(prof.id) ?? null : null;
    const payments_total_cents = payCentsByUser.get(prof.id) ?? 0;
    const email = prof?.email ?? emailById.get(prof.id) ?? null;
    const meta_phone = metaPhoneById.get(prof.id) ?? null;
    const meta_company = metaCompanyById.get(prof.id) ?? null;
    const user_balance = balanceByUser.get(prof.id) ?? 0;
    return { profile: { ...prof, email }, billing, payments_total_cents, user_balance, meta_phone, meta_company };
  });

  return rows;
}

async function getCorporateUsers(
  supabase: any,
  corporateIds: Set<string>,
  emailById: Map<string, string | null>,
  metaPhoneById: Map<string, string | null>,
  metaCompanyById: Map<string, string | null>
): Promise<CorporateUserRow[]> {
  if (corporateIds.size === 0) return [];

  const idList = Array.from(corporateIds);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", idList)
    .limit(5000);

  const { data: billingRows } = await adminSelect(
    "billing_profiles",
    adminClient
      .from("billing_profiles")
      .select("user_id, full_name, company_name, address_line, city, country, phone, phone_dial_code")
      .in("user_id", idList)
      .limit(5000)
  );
  const billingByUser = new Map<string, Billing>();
  (billingRows ?? []).forEach((b: Billing) => {
    if (b.user_id) billingByUser.set(b.user_id, b);
  });

  // ORDERS total per user (paid only)
  const { data: orders } = await adminSelect(
    "orders",
    adminClient
      .from("orders")
      .select("user_id, amount, amount_cents, amount_tl, status, payment_status, paid_at")
      .in("user_id", idList)
      .limit(50000)
  );
  const payCentsByUser = new Map<string, number>();
  (orders ?? []).forEach((o: any) => {
    if (!o?.user_id) return;
    if (!orderIsPaid(o)) return;
    const cents = centsFromOrder(o);
    if (cents <= 0) return;
    const prev = payCentsByUser.get(o.user_id) ?? 0;
    payCentsByUser.set(o.user_id, prev + cents);
  });

  // org membership (first org_id)
  const { data: memberships } = await adminSelect(
    "organization_members",
    adminClient
      .from("organization_members")
      .select("org_id, user_id")
      .in("user_id", idList)
      .limit(10000)
  );
  const firstOrgByUser = new Map<string, string>();
  (memberships ?? []).forEach((m: any) => {
    if (!m?.user_id || !m?.org_id) return;
    if (!firstOrgByUser.has(m.user_id)) firstOrgByUser.set(m.user_id, m.org_id);
  });

  // Org credit balance
  const orgIds = Array.from(new Set(Array.from(firstOrgByUser.values()).filter(Boolean)));
  const orgBalanceByOrg = new Map<string, number>();
  if (orgIds.length) {
    const { data: orgLedger } = await adminSelect(
      "credit_ledger(org)",
      adminClient
        .from("credit_ledger")
        .select("scope_type, scope_id, change")
        .eq("scope_type", "org")
        .in("scope_id", orgIds)
        .limit(50000)
    );
    (orgLedger ?? []).forEach((row: any) => {
      if (row?.scope_type !== "org") return;
      const id = row?.scope_id;
      const ch = Number(row?.change ?? 0);
      if (!id || !Number.isFinite(ch)) return;
      orgBalanceByOrg.set(id, (orgBalanceByOrg.get(id) ?? 0) + ch);
    });
  }

  const rows: CorporateUserRow[] = (profiles ?? []).map((prof: Profile) => {
    const billing = prof?.id ? billingByUser.get(prof.id) ?? null : null;
    const payments_total_cents = payCentsByUser.get(prof.id) ?? 0;
    const email = prof?.email ?? emailById.get(prof.id) ?? null;
    const org_id = firstOrgByUser.get(prof.id) ?? null;
    const meta_phone = metaPhoneById.get(prof.id) ?? null;
    const meta_company = metaCompanyById.get(prof.id) ?? null;
    const org_balance = org_id ? (orgBalanceByOrg.get(org_id) ?? 0) : 0;
    return {
      profile: { ...prof, email },
      billing,
      payments_total_cents,
      org_balance,
      org_id,
      meta_phone,
      meta_company,
    };
  });

  return rows;
}

function Tabs({ active }: { active: "users" | "corporates" }) {
  const base = "/admin/users";
  return (
    <div className="flex gap-2 border-b mb-4">
      <Link
        href={`${base}?tab=users`}
        className={`px-3 py-2 -mb-px border-b-2 ${active === "users" ? "border-black font-semibold" : "border-transparent text-gray-500"}`}
      >
        Users
      </Link>
      <Link
        href={`${base}?tab=corporates`}
        className={`px-3 py-2 -mb-px border-b-2 ${active === "corporates" ? "border-black font-semibold" : "border-transparent text-gray-500"}`}
      >
        Corporates
      </Link>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="border px-2 py-1 align-top">{children}</td>;
}
function Row({ children }: { children: React.ReactNode }) {
  return <tr className="border">{children}</tr>;
}
function Table({ children }: { children: React.ReactNode }) {
  return <table className="w-full text-sm border-collapse border mb-8">{children}</table>;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; sort?: string; dir?: "asc" | "desc" }>;
}) {
  const supabase = await supabaseServer();
  const { data: me } = await supabase.auth.getUser();
  if (!me?.user) redirect("/admin/login?next=/admin/users");

  const sp = await searchParams;
  const tab = (sp?.tab === "corporates" ? "corporates" : "users") as "users" | "corporates";
  const q = sp?.q || "";
  const sort = sp?.sort || "";
  const dir = (sp?.dir === "desc" ? "desc" : "asc") as "asc" | "desc";

  const { individualIds, corporateIds, emailById, metaPhoneById, metaCompanyById } = await listUsersByAccountType();

  const individualsRaw = tab === "users"
    ? await getIndividuals(supabase, individualIds, emailById, metaPhoneById, metaCompanyById)
    : [];
  const corporatesRaw = tab === "corporates"
    ? await getCorporateUsers(supabase, corporateIds, emailById, metaPhoneById, metaCompanyById)
    : [];

  // Apply filters/sort server-side
  const applyFilterSort = (rows: any[]) => {
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
  };

  const individuals = tab === "users" ? applyFilterSort(individualsRaw) : [];
  const corporateUsers = tab === "corporates" ? applyFilterSort(corporatesRaw) : [];

  // FIXED: use absolute /api path (not under /admin)
  const exportHref = `/api/admin/users/export?tab=${encodeURIComponent(tab)}&q=${encodeURIComponent(q)}&sort=${encodeURIComponent(sort)}&dir=${encodeURIComponent(dir)}`;

  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-col gap-3">
        <Tabs active={tab} />
        {/* Controls */}
        <form method="get" action="/admin/users" className="flex flex-wrap gap-2 items-center">
          <input type="hidden" name="tab" value={tab} />
          <input
            name="q"
            defaultValue={q}
            placeholder={tab === "users" ? "Ad, e-posta, tel, adres..." : "Firma, e-posta, tel, adres..."}
            className="border px-2 py-1 rounded min-w-[260px]"
          />
          <label className="text-sm text-gray-600">Sırala:</label>
          <select name="sort" defaultValue={sort} className="border px-2 py-1 rounded">
            {tab === "users" ? (
              <>
                <option value="">ID</option>
                <option value="name">Ad</option>
                <option value="email">E-posta</option>
                <option value="odeme">Ödeme</option>
                <option value="bakiye">Kredi Bakiyesi</option>
              </>
            ) : (
              <>
                <option value="">ID</option>
                <option value="firma">Firma</option>
                <option value="email">E-posta</option>
                <option value="odeme">Ödeme</option>
                <option value="bakiye">Kredi Bakiyesi</option>
              </>
            )}
          </select>
          <select name="dir" defaultValue={dir} className="border px-2 py-1 rounded">
            <option value="asc">Artan</option>
            <option value="desc">Azalan</option>
          </select>
          <button type="submit" className="px-3 py-1 border rounded">Uygula</button>

          {/* Excel export - fixed absolute path */}
          <a href={exportHref} className="ml-auto px-3 py-1 border rounded bg-gray-50 hover:bg-gray-100">Excel'e Aktar</a>
        </form>
      </div>

      {tab === "users" ? (
        <Table>
          <thead>
            <tr className="bg-gray-50">
              <th className="border px-2 py-1 text-left">ID</th>
              <th className="border px-2 py-1 text-left">Ad Soyad</th>
              <th className="border px-2 py-1 text-left">E-posta</th>
              <th className="border px-2 py-1 text-left">Tel</th>
              <th className="border px-2 py-1 text-left">Ödeme Toplamı</th>
              <th className="border px-2 py-1 text-left">Fatura Adresi</th>
              <th className="border px-2 py-1 text-left">Kredi Bakiyesi</th>
              <th className="border px-2 py-1 text-left">Kredi Yükle</th>
              <th className="border px-2 py-1 text-left">Kredi Sil</th>
            </tr>
          </thead>
          <tbody>
            {individuals.map((r) => (
              <Row key={r.profile.id}>
                <Cell>{r.profile.id}</Cell>
                <Cell>{r.billing?.full_name ?? r.profile.full_name ?? "-"}</Cell>
                <Cell>{r.profile.email ?? "-"}</Cell>
                <Cell>{composePhone(r.meta_phone, r.billing)}</Cell>
                <Cell>{formatTRYfromCents(r.payments_total_cents)}</Cell>
                <Cell>{composeAddress(r.billing)}</Cell>
                <Cell>{r.user_balance}</Cell>
                <Cell>
                  <form action="/api/admin/credits/adjust" method="post" className="flex gap-2">
                    <input type="hidden" name="scope_type" defaultValue="user" />
                    <input type="hidden" name="scope_id" defaultValue={String(r.profile.id)} />
                    <input
                      name="amount"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="miktar"
                      className="border px-1 py-0.5 w-24 min-w-[4.5rem]"
                      required
                    />
                    <button type="submit" className="underline">Yükle</button>
                  </form>
                </Cell>
                <Cell>
                  <form action="/api/admin/credits/adjust" method="post" className="flex gap-2">
                    <input type="hidden" name="scope_type" defaultValue="user" />
                    <input type="hidden" name="scope_id" defaultValue={String(r.profile.id)} />
                    <input type="hidden" name="negate" defaultValue="1" />
                    <input
                      name="amount"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="miktar"
                      className="border px-1 py-0.5 w-24 min-w-[4.5rem]"
                      required
                    />
                    <button type="submit" className="underline">Sil</button>
                  </form>
                </Cell>
              </Row>
            ))}
          </tbody>
        </Table>
      ) : (
        <Table>
          <thead>
            <tr className="bg-gray-50">
              <th className="border px-2 py-1 text-left">ID</th>
              <th className="border px-2 py-1 text-left">Firma Adı</th>
              <th className="border px-2 py-1 text-left">E-posta</th>
              <th className="border px-2 py-1 text-left">Tel</th>
              <th className="border px-2 py-1 text-left">Fatura Adresi</th>
              <th className="border px-2 py-1 text-left">Ödeme Toplamı</th>
              <th className="border px-2 py-1 text-left">Kredi Bakiyesi</th>
              <th className="border px-2 py-1 text-left">Kredi Yükle</th>
              <th className="border px-2 py-1 text-left">Kredi Sil</th>
            </tr>
          </thead>
          <tbody>
            {corporateUsers.map((r) => (
              <Row key={r.profile.id}>
                <Cell>{r.profile.id}</Cell>
                <Cell>{r.billing?.company_name ?? r.meta_company ?? "-"}</Cell>
                <Cell>{r.profile.email ?? "-"}</Cell>
                <Cell>{composePhone(r.meta_phone, r.billing)}</Cell>
                <Cell>{composeAddress(r.billing)}</Cell>
                <Cell>{formatTRYfromCents(r.payments_total_cents)}</Cell>
                <Cell>{r.org_balance}</Cell>
                <Cell>
                  <form action="/api/admin/credits/adjust" method="post" className="flex gap-2">
                    <input type="hidden" name="scope_type" defaultValue="org" />
                    <input type="hidden" name="scope_id" defaultValue={String(r.org_id ?? "")} />
                    <input type="hidden" name="member_user_id" defaultValue={String(r.profile.id)} />
                    <input
                      name="amount"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="miktar"
                      className="border px-1 py-0.5 w-24 min-w-[4.5rem]"
                      required
                    />
                    <button type="submit" className="underline">Yükle</button>
                  </form>
                </Cell>
                <Cell>
                  <form action="/api/admin/credits/adjust" method="post" className="flex gap-2">
                    <input type="hidden" name="scope_type" defaultValue="org" />
                    <input type="hidden" name="scope_id" defaultValue={String(r.org_id ?? "")} />
                    <input type="hidden" name="negate" defaultValue="1" />
                    <input type="hidden" name="member_user_id" defaultValue={String(r.profile.id)} />
                    <input
                      name="amount"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="miktar"
                      className="border px-1 py-0.5 w-24 min-w-[4.5rem]"
                      required
                    />
                    <button type="submit" className="underline">Sil</button>
                  </form>
                </Cell>
              </Row>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
