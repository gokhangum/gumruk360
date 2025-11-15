import Link from "next/link";

import { supabaseServer } from "../../../lib/supabase/server";
import { supabaseAdmin } from "../../../lib/supabase/serverAdmin";
import { getTranslations } from "next-intl/server";
type AnnouncementRow = {
  id: string;
  created_at: string;
  title: string;
  audience: string;
};

export default async function WorkerAnnouncementsPage() {
	const t = await getTranslations("ann");

  const s = await supabaseServer();
  const { data: u } = await s.auth.getUser();

  if (!u?.user?.id) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">{t("list.title")}</h1>
       <p className="text-sm text-gray-600">{t("loginToContinue")}</p>
      </div>
    );
  }
  const uid = u.user.id;
// Kullanıcının tenant kodu (profiles.tenants_key)
const { data: prof, error: profErr } = await supabaseAdmin
  .from("profiles")
  .select("tenant_key")
  .eq("id", uid)
  .maybeSingle();

 if (profErr && "message" in profErr && profErr.message) {
   console.error("profiles.tenant_key error:", profErr.message);
 }

const tenantKey = prof?.tenant_key || null;
if (!tenantKey) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">{t("list.title")}</h1>
      <p className="text-sm text-gray-600">{t("list.noTenantKey")}</p>
    </div>
  );
}

// tenants.code -> tenants.id
const { data: ten, error: tenErr } = await supabaseAdmin
  .from("tenants")
  .select("id, code")
  .eq("code", tenantKey)
  .maybeSingle();

if (tenErr) {
  console.error("tenant(code) error:", tenErr);
}

const tenantId = ten?.id || null;
if (!tenantId) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">{t("list.title")}</h1>
      <p className="text-sm text-gray-600">{t("list.tenantNotFound")}</p>
    </div>
  );
}


  // 1) Yayınlanmış duyurular: sadece worker hedefli olanlar
  const { data: anns, error } = await supabaseAdmin
    .from("announcements")
    .select("id,created_at,title,audience,status")
    .eq("status", "published")
    .in("audience", ["all_workers", "specific"])
	.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .order("created_at", { ascending: false });

  const all = (anns || []) as AnnouncementRow[];

  // "specific" olanlarda sadece bu kullanıcıyı hedefleyenler kalsın
  const specificIds = all.filter(a => a.audience === "specific").map(a => a.id);
  let allowedSpecific = new Set<string>();
  if (specificIds.length) {
    const { data: targets } = await supabaseAdmin
      .from("announcement_targets")
      .select("announcement_id")
      .eq("user_id", uid)
      .in("announcement_id", specificIds);
    for (const t of targets || []) {
      allowedSpecific.add(String((t as any).announcement_id));
    }
  }

  const rows = all.filter(a => a.audience === "all_workers" || allowedSpecific.has(a.id));

  // 2) Bu kullanıcı için okunmuş duyuru id’leri
  let readSet = new Set<string>();
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const { data: reads } = await s
      .from("announcement_reads")
      .select("announcement_id")
      .eq("user_id", uid)
      .in("announcement_id", ids);

    for (const r of reads || []) readSet.add((r as any).announcement_id as string);
  }

  return (
      <div className="-mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 w-full max-w-none md:max-w-[928px]">
        <div className="card-surface shadow-colored rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">

        <div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 mb-4 flex items-center gap-3">
          <button type="button" className="btn btn--primary btn--cta">
            {t("list.title")}
          </button>
        </div>

        {error && <div className="text-red-600 text-sm">{t("errors.listFailed")} {error.message}</div>}

        <div className="border rounded overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="px-3 py-2">{t("table.title")}</th>
                <th className="px-3 py-2 w-32">{t("table.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isRead = readSet.has(r.id);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      <Link className="font-medium hover:underline" href={`/worker/announcements/${r.id}`}>
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className={isRead ? "text-gray-600" : "text-amber-700"}>
                        {isRead ? t("readStatus.read") : t("readStatus.unread")}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={2}>
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </div>


  );
}
