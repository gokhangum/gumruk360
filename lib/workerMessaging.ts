import { createClient } from "@supabase/supabase-js";

export async function isWorkerMessagingEnabledFor(workerId: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("supabase_service_role_missing");

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await admin
    .rpc("get_worker_message_permission", { _worker_id: workerId });
  if (error) throw error;

  // data boolean döner
  return !!data;
}
