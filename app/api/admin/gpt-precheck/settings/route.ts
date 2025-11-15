// app/api/admin/gpt-precheck/settings/route.ts
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import { APP_DOMAINS } from "@/lib/config/appEnv";
function detectDomain(h: Headers) {
  const host = h.get("x-forwarded-host") || h.get("host") || ""
  return host.split(":")[0] || APP_DOMAINS.primary
}

export async function GET(req: Request) {
  const h = await headers()
  const domain = detectDomain(h)
  const { searchParams } = new URL(req.url)
     const locale =
    (searchParams.get("locale") || "").toLowerCase() ||
     ((APP_DOMAINS.en && domain.endsWith(APP_DOMAINS.en)) ? "en" : "tr")

  const { data, error } = await supabaseAdmin
    .from("gpt_precheck_settings")
    .select("*")
    .eq("domain", domain)
    .eq("locale", locale)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: Request) {
  const h = await headers()
  const domain = detectDomain(h)
  const body = await req.json().catch(() => ({}))

  const {
    locale,
    meaningful_confidence_min,
    customs_related_confidence_min,
    l2_prompt,
    // NEW
    l2_visible_groups,
    l2_pass_policy,
    l2_strictness,
    actor_user_id
  } = body || {}

  if (!locale) return NextResponse.json({ ok: false, error: "LOCALE_REQUIRED" }, { status: 400 })

  // sanitize bounds to [0,1]
  const mm = Math.max(0, Math.min(1, Number(meaningful_confidence_min ?? 0.7)))
  const cm = Math.max(0, Math.min(1, Number(customs_related_confidence_min ?? 0.7)))

  // sanitize json fields
  const vg = (l2_visible_groups && typeof l2_visible_groups === 'object') ? {
    required: !!l2_visible_groups.required,
    should: !!l2_visible_groups.should,
    info: !!l2_visible_groups.info,
  } : { required: true, should: true, info: true }

  let mode: 'required_only' | 'required_and_should' = 'required_only'
  if (l2_pass_policy?.mode === 'required_and_should') mode = 'required_and_should'
  let should_max = 0
  if (typeof l2_pass_policy?.should_max === 'number' && l2_pass_policy.should_max >= 0) {
    should_max = Math.floor(l2_pass_policy.should_max)
  }
  const pp = { mode, should_max }

  let strict: number | null = null
  if (typeof l2_strictness === 'number') {
    strict = Math.max(0, Math.min(5, Math.floor(l2_strictness)))
  }

  const payload: any = {
    domain,
    locale,
    meaningful_confidence_min: mm,
    customs_related_confidence_min: cm,
    l2_prompt: (typeof l2_prompt === 'string') ? l2_prompt : null,
    // NEW
    l2_visible_groups: vg,
    l2_pass_policy: pp,
    l2_strictness: strict ?? 1,
    updated_by: actor_user_id || null,
    updated_at: new Date().toISOString(),
  }

  // upsert on (domain, locale)
  const { data, error } = await supabaseAdmin
    .from("gpt_precheck_settings")
    .upsert(payload, { onConflict: "domain,locale" })
    .select("*")
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Audit (best-effort)
  try {
    await supabaseAdmin.from("audit_logs").insert({
      event: "precheck.settings.updated",
      resource_type: "settings",
      resource_id: data.id,
      payload,
      action: "update",
      actor_role: "admin",
    })
  } catch {}

  return NextResponse.json({ ok: true, data })
}
