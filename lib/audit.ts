// lib/audit.ts
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"

export async function logAudit(input: {
  user_id?: string | null
  question_id?: string | null
  action: string
  payload?: any
}) {
  const { error } = await supabaseAdmin.from("audit_logs").insert([
    {
      user_id: input.user_id ?? null,
      question_id: input.question_id ?? null,
      action: input.action,
      payload: input.payload ?? null, // JSONB
      // created_at -> DB default
    },
  ])
  if (error) throw error
  return { ok: true as const }
}
