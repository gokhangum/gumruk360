// app/admin/seo/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

function parseKeywords(input: string | null): string[] | null {
  if (!input) return null;
  const arr = input.split(",").map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}
function parseJson(input: string | null): any | null {
  if (!input) return null;
  try { return JSON.parse(input); } catch { return null; }
}

export async function upsertSeoAction(formData: FormData) {
  const tenant_code = (formData.get("tenant_code") as string || "").trim();
  const locale = (formData.get("locale") as string || "").trim();
  const route = (formData.get("route") as string || "").trim() || "*";
  const title = (formData.get("title") as string || "").trim() || null;
  const description = (formData.get("description") as string || "").trim() || null;
  const keywords = parseKeywords((formData.get("keywords") as string) || "");
  const og_image_url = (formData.get("og_image_url") as string || "").trim() || null;
  const jsonld = parseJson((formData.get("jsonld") as string) || "");
  const is_active = formData.get("is_active") ? true : false;

  if (!tenant_code || !locale || !route) {
    throw new Error("tenant_code, locale ve route zorunludur.");
  }
  const { error } = await supabaseAdmin.from("tenant_seo").upsert({
    tenant_code, locale, route,
    title, description, keywords, og_image_url, jsonld, is_active,
    updated_at: new Date().toISOString()
  }, { onConflict: "tenant_code,locale,route" });
  if (error) throw error;
  revalidatePath("/admin/seo");
}

export async function deleteSeoAction(formData: FormData) {
  const tenant_code = (formData.get("tenant_code") as string || "").trim();
  const locale = (formData.get("locale") as string || "").trim();
  const route = (formData.get("route") as string || "").trim();
  if (!tenant_code || !locale || !route) throw new Error("Eksik anahtar.");
  const { error } = await supabaseAdmin
    .from("tenant_seo")
    .delete()
    .eq("tenant_code", tenant_code)
    .eq("locale", locale)
    .eq("route", route);
  if (error) throw error;
  revalidatePath("/admin/seo");
}

export async function toggleSeoActiveAction(formData: FormData) {
  const tenant_code = (formData.get("tenant_code") as string || "").trim();
  const locale = (formData.get("locale") as string || "").trim();
  const route = (formData.get("route") as string || "").trim();
  const valueStr = (formData.get("next_is_active") as string) || "";
  const next_is_active = valueStr === "true";
  if (!tenant_code || !locale || !route) throw new Error("Eksik anahtar.");
  const { error } = await supabaseAdmin
    .from("tenant_seo")
    .update({ is_active: next_is_active, updated_at: new Date().toISOString() })
    .eq("tenant_code", tenant_code)
    .eq("locale", locale)
    .eq("route", route);
  if (error) throw error;
  revalidatePath("/admin/seo");
}
