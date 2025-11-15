// app/api/feature-flags/route.ts
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import { supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"

// Returns the worker messaging flag. If a logged-in user exists, returns the
// *effective* permission for that user (override > global). Otherwise returns global.
export async function GET() {
  try {
    const admin = supabaseAdmin

    // 1) Read global default
    const { data: flag, error: flagErr } = await admin
      .from("feature_flags")
      .select("worker_messaging_enabled")
      .eq("id", "worker_messaging")
      .maybeSingle()
    if (flagErr) throw flagErr

    let enabled = !!(flag?.worker_messaging_enabled ?? true)
    // draft (global)
    const { data: draftFlag } = await admin
       .from("feature_flags")
      .select("draft_generate_enabled")
      .eq("id", "default")
      .maybeSingle()
   let draftEnabled = !!(draftFlag?.draft_generate_enabled ?? true)

    let source: "global" | "effective" | "fallback" = "global"

    // 2) If there is a logged-in user, compute effective permission for them.
    try {
      const sup = await supabaseServer()
const { data: userRes } = await sup.auth.getUser()

      const uid = userRes?.user?.id
      if (uid) {
       const { data: effRow, error: effErr } = await admin
         .from("v_worker_message_permission")
        .select("override,effective_enabled")
        .eq("worker_id", uid)
         .maybeSingle()
       if (!effErr && effRow) {
          const ov = (effRow as any)?.override as "allow" | "deny" | "inherit" | null
         // worker draft effective
         const { data: effDraft } = await admin.rpc("v_worker_draft_permission_effective", { in_worker_id: uid })
          if (typeof effDraft === "boolean") { draftEnabled = effDraft }

          if (ov === "allow") {
           enabled = true
            source = "effective"
         } else if (ov === "deny") {
            enabled = false
           source = "effective"
          } else if (typeof (effRow as any)?.effective_enabled === "boolean") {
            // inherit ise view hesapladığını kullan
            enabled = (effRow as any).effective_enabled
            source = "effective"
          }
        }


      }
    } catch {
      // ignore and keep global
    }

    return NextResponse.json({ workerMessagingEnabled: enabled, draftGenerateEnabled: draftEnabled, source })
  } catch {
    return NextResponse.json({ workerMessagingEnabled: true, draftGenerateEnabled: true, source: "fallback" })
  }
}
