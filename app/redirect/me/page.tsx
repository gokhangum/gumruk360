// app/redirect/me/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server"; // proje yoluna göre düzelt
import { headers } from "next/headers";
// Not: server helper'ınız async olmalı ve cookies() içinde await kullanmalı.

export default async function RedirectMePage() {
  const supabase = await supabaseServer();

  // 1) Oturum var mı?
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    redirect(`/login?next=/redirect/me`);
  }

  // 2) Profil rolünü al
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, tenant_key")
    .eq("id", user.id)
    .maybeSingle();
	  // 2.1) tenant_key yoksa Host'a göre set et
  if (!profile?.tenant_key) {
    const hdrs = await headers();
    const host = (hdrs.get("host") || "").toLowerCase();

    let tenantKey: string | null = null;
    if (host.includes("tr.easycustoms360")) tenantKey = "tr.easycustoms360";
    else if (host.includes("gumruk360")) tenantKey = "gumruk360";
    else if (host.startsWith("127.0.0.1") || host.includes("localhost")) {
      tenantKey = process.env.NEXT_PUBLIC_DEV_TENANT_KEY || "gumruk360";
    }

    if (tenantKey) {
      await supabase
        .from("profiles")
        .update({ tenant_key: tenantKey })
        .eq("id", user.id);

      // (opsiyonel) audit
      try {
        await supabase.from("audit_logs").insert({
          actor_user_id: user.id,
          actor_role: "system",
          action: "tenant.bootstrap",
          event: "tenant.set_on_redirect",
          resource_type: "user",
          resource_id: user.id,
          payload: { host, tenantKey },
          created_at: new Date().toISOString(),
        });
      } catch {}
    }
  }


   const role = profile?.role ?? "user";

   // Kullanıcı tipi: individual mı corporate mi? (dashboard/layout ile aynı mantık)
  const accountType = (user?.user_metadata as any)?.account_type as string | undefined;
   const howItWorksHref = accountType === "corporate"
    ? "/dashboard/how-it-works/corporate"
     : "/dashboard/how-it-works/individual";
   // 3) Role → hedef haritası

   const targetByRole: Record<string, string> = {
     admin: "/admin/",
     worker: "/worker",
     user: howItWorksHref,
   };

  const target = targetByRole[role] ?? "/dashboard";
  redirect(target);
}
