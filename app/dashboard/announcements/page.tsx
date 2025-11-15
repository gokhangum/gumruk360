import Link from "next/link";
import { supabaseServer } from "../../../lib/supabase/server";
import { supabaseAdmin } from "../../../lib/supabase/serverAdmin";
import { getTranslations } from "next-intl/server";
type AnnouncementRow = {
  id: string;
  created_at: string;
  title: string;
};

export default async function UserAnnouncementsPage() {
  const s = await supabaseServer();
  const { data: u } = await s.auth.getUser();
const t = await getTranslations("ann");

  if (!u?.user?.id) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">{t("list.title")}</h1>

        <p className="text-sm text-gray-600">{t("loginToContinue")}</p>

      </div>
    );
  }
  const uid = u.user.id;

// Kullanıcının tenant_key'i ve buna karşılık gelen tenant_id'yi bul
const { data: prof } = await s
  .from("profiles")
  .select("tenant_key")
  .eq("id", uid)
  .maybeSingle();

const tenantKey = prof?.tenant_key || null;

let tenantId: string | null = null;
if (tenantKey) {
   const { data: ten } = await supabaseAdmin
     .from("tenants")
    .select("id")
    .eq("code", tenantKey)
     .maybeSingle();
  tenantId = ten?.id ?? null;

}
// Kullanıcı herhangi bir organizasyonda OWNER mı?
let isOwner = false;

const { data: mems } = await supabaseAdmin
    .from("organization_members")
    .select("org_role")
    .eq("user_id", uid)
    .limit(50);

  isOwner =
    Array.isArray(mems) &&
    mems.some(
      (m: any) => String(m.org_role ?? "").trim().toLowerCase() === "owner"
    );




// ---- Dayanıklı çekme: all_users ve (owner ise) all_owners ayrı ayrı ----

// Ortak tenant filtresi (string ifade yerine iki ayrı where kullanacağız)
const baseSelect = "id,created_at,title,audience,tenant_id";

// 1) all_users
let qUsers = s
  .from("announcements")
  .select(baseSelect)
  .eq("status", "published")
  .eq("audience", "all_users");

if (tenantId) {
  qUsers = qUsers.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
} else {
  qUsers = qUsers.is("tenant_id", null);
}

const { data: usersAnns, error: usersErr } = await qUsers.order("created_at", { ascending: false });


// 2) all_owners (sadece owner ise)
let ownersAnns: any[] = [];
let ownersErr: any = null;

if (isOwner) {
  let qOwners = s
    .from("announcements")
    .select(baseSelect)
    .eq("status", "published")
    .eq("audience", "all_owners");

  if (tenantId) {
    qOwners = qOwners.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
  } else {
    qOwners = qOwners.is("tenant_id", null);
  }

  const ownersRes = await qOwners.order("created_at", { ascending: false });
  ownersAnns = ownersRes.data || [];
  ownersErr = ownersRes.error || null;


  // --- Fallback: RLS nedeniyle user oturumunda boş gelirse admin ile oku ---
  if ((ownersAnns.length === 0) && !ownersErr) {
    try {
      let qOwnersAdmin = supabaseAdmin
        .from("announcements")
        .select(baseSelect)
        .eq("status", "published")
        .eq("audience", "all_owners");

      if (tenantId) {
        qOwnersAdmin = qOwnersAdmin.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
      } else {
        qOwnersAdmin = qOwnersAdmin.is("tenant_id", null);
      }

      const { data: ownersAdmin, error: ownersAdminErr } =
        await qOwnersAdmin.order("created_at", { ascending: false });

      if (!ownersAdminErr && Array.isArray(ownersAdmin)) {
        ownersAnns = ownersAdmin;

      } else {
 
      }
    } catch (e) {

    }
  }
} else {

}
// 2.5) specific (kullanıcıya özel) duyurular
let specificAnns: any[] = [];
let specificErr: any = null;

// Bu kullanıcıya hedeflenmiş duyuru id'lerini çek
const { data: targetIds, error: targetsErr } = await s
  .from("announcement_targets")
  .select("announcement_id")
  .eq("user_id", uid)
  .limit(1000);

const specIds = (targetIds || []).map((r: any) => r.announcement_id).filter(Boolean);

// İlgili duyuruları (published + audience=specific) getir
if (specIds.length) {
  let qSpec = s
    .from("announcements")
    .select(baseSelect)
    .eq("status", "published")
    .eq("audience", "specific")
    .in("id", specIds);

  // NOT: specific için tenant filtresi zorunlu değil; hedefleme zaten kullanıcıya özel
  const { data: specData, error: specErr } = await qSpec.order("created_at", { ascending: false });
  specificAnns = specData || [];
  specificErr = specErr || null;
}

// 3) Birleştir + tekilleştir + tarihe göre sırala
const merged = [...(usersAnns || []), ...(ownersAnns || []), ...(specificAnns || [])];
const seen = new Set<string>();
const anns = merged.filter(r => {
  if (!r?.id) return false;
  if (seen.has(r.id)) return false;
  seen.add(r.id);
  return true;
}).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

// Hata birleştirme (bilgi amaçlı)
const error = usersErr || ownersErr || null;





  const rows = (anns || []) as AnnouncementRow[];

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
               <Link className="font-medium hover:underline" href={`/dashboard/announcements/${r.id}`}>
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
