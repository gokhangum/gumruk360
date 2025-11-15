export const runtime = "nodejs";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "../../../lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import FXSettingsForm from "./FXSettingsFormClient";

type TenantRow = {
  id: string;
  primary_domain: string | null;
  currency: string | null;
  pricing_multiplier: number | null;
};
const ALLOWED_CURRENCIES = ["TRY", "USD", "EUR", "GBP", "AED"];
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(url, key, { auth: { persistSession: false } });
}

async function getTenantsForAdmin(): Promise<TenantRow[]> {
  const a = admin();
  const { data, error } = await a
    .from("tenants")
    .select("id, primary_domain, currency, pricing_multiplier")
    .order("primary_domain", { ascending: true });
  if (error) {
   
    return [];
  }
  // numeric -> number garanti etmek için
  return (data ?? []).map((t: any) => ({
    ...t,
    pricing_multiplier:
      typeof t.pricing_multiplier === "string"
        ? Number(t.pricing_multiplier)
        : t.pricing_multiplier,
  })) as TenantRow[];
}

async function requireAdmin() {
  const sb = await supabaseServer(); // <-- önemli: await
  const { data: userRes } = await sb.auth.getUser();
  if (!userRes?.user) notFound();

  // Projede mevcutsa:
  const { data: isAdmin, error } = await sb.rpc("is_admin");
  if (error) {
    
    notFound();
  }
  if (!isAdmin) notFound();
}

export default async function Page() {
  await requireAdmin();
  const tenants = await getTenantsForAdmin();

  async function updateTenantAction(formData: FormData) {
    "use server";
    await requireAdmin();

    const tenantId = String(formData.get("tenantId") || "").trim();
    const currency = String(formData.get("currency") || "").trim().toUpperCase();
    const rawMultiplier = String(formData.get("pricing_multiplier") || "").trim();

    if (!tenantId) throw new Error("tenantId missing");
    if (!currency) throw new Error("currency missing");
if (!ALLOWED_CURRENCIES.includes(currency)) {
  throw new Error("currency not allowed");
}
    const normalized = rawMultiplier.replace(",", ".");
    const value = Number(normalized);
    if (!isFinite(value)) throw new Error("pricing_multiplier must be a number");
    if (value <= 0 || value > 100) throw new Error("pricing_multiplier out of range (0, 100]");

    const a = admin();
    const { error: updErr } = await a
      .from("tenants")
      .update({ currency, pricing_multiplier: value })
      .eq("id", tenantId);

    if (updErr) {
      
      throw new Error(updErr.message || "update failed");
    }

    revalidatePath("/admin/fx-payments");
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">FX Ödeme Ayarları</h1>

      {tenants.length === 0 ? (
        <div className="p-4 rounded-md border">
          Henüz tenant kaydı bulunamadı.
        </div>
      ) : (
        <FXSettingsForm tenants={tenants} updateTenantAction={updateTenantAction} />
      )}
    </div>
  );
}
