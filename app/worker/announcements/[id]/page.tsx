import { notFound } from "next/navigation";
import { supabaseServer } from "../../../../lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { supabaseAdmin } from "../../../../lib/supabase/serverAdmin";
type Announcement = {
  id: string;
  created_at: string;
  title: string;
  body: string;
};
type FileRow = { object_path: string | null; file_name: string | null; mime: string | null };
type SignedLink = { name: string; url: string; key?: string };
const signedLinks: SignedLink[] = [];
export default async function WorkerAnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getTranslations("ann");
  const s = await supabaseServer();
  const { data: u } = await s.auth.getUser();
  if (!u?.user?.id) {
    notFound();
  }
  const uid = u.user.id;

  // Duyuru detayı
  const { data: ann } = await s
    .from("announcements")
    .select("id,created_at,title,body")
    .eq("id", id)
    .single();

  if (!ann) {
    notFound();
  }
  // Ekler: DB'den dosya kayıtlarını çek
const { data: files, error: filesErr } = await supabaseAdmin
  .from("announcement_attachments")
  .select("object_path,file_name,mime")
  .eq("announcement_id", id);
  if (!filesErr && files && files.length > 0) {
    for (const f of files as FileRow[]) {
      const key = (f.object_path || "").replace(/^\/+/, "");
      if (!key) continue;
      const { data: signed } = await supabaseAdmin.storage.from("attachments").createSignedUrl(key, 600);
      if (signed?.signedUrl) {
        signedLinks.push({ name: f.file_name || key.split("/").pop() || "file", url: signed.signedUrl, key });
      }
    }
  }

  // 2) DB yine boşsa, storage list ile admin olarak ara (iki olası dizin)
  if (signedLinks.length === 0) {
    const prefixes = [
      `announcements/${id}`,
      `attachments/announcements/${id}`,
      `${id}`
    ] as const;
    for (const prefix of prefixes) {
      const { data: listed, error: listErr } = await supabaseAdmin.storage.from("attachments").list(prefix, { limit: 200 });
 
      if (listed && listed.length > 0) {
        for (const obj of listed) {
          if (!obj.name) continue;
          const key = `${prefix}/${obj.name}`;
          const { data: signed } = await supabaseAdmin.storage.from("attachments").createSignedUrl(key, 600);
          if (signed?.signedUrl) signedLinks.push({ name: obj.name, url: signed.signedUrl, key });
        }
        if (signedLinks.length > 0) break;
      }
    }
  }
  // Okundu olarak işaretle (idempotent)
  await s
    .from("announcement_reads")
    .upsert(
      { announcement_id: ann.id, user_id: uid, read_at: new Date().toISOString() },
      { onConflict: "announcement_id,user_id" }
    );

  return (
 <div className="-mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 w-full max-w-none md:max-w-[928px]">
     <div className="card-surface shadow-colored p-5 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">{ann.title}</h1>
        <a href="/worker/announcements" className="btn btn--ghost text-sm">
          {t("detail.back")}
        </a>
      </div>

      <div className="text-xs text-gray-600">
        {new Date(ann.created_at).toLocaleString()}
      </div>
 <div className="card-surface rounded-xl overflow-hidden edge-underline edge-blue edge-taper edge-rise-2mm">
        <div className="flex items-center justify-between border-b px-4 py-2 text-sm font-semibold">{t("detail.content")}</div>
      <div
        className="p-4 prose max-w-none"
        dangerouslySetInnerHTML={{ __html: ann.body }}
      />
    </div>
	<div className="card-surface p-0 rounded-xl overflow-hidden">
       <div className="border-b px-4 py-2 text-sm font-semibold">{t("attachments.title")}</div>

        <div className="p-3 flex flex-wrap gap-3">
          {signedLinks.length > 0 ? (
            signedLinks.map((f, i) => (
              <div key={i}>
                <a className="rounded p-2 hover:bg-gray-50 max-w-[220px] underline" href={f.url} target="_blank" rel="noreferrer">
                  {f.name}
                </a>
              
              </div>
            ))
          ) : (
            <div className="text-gray-500 text-sm">{t("attachments.empty")}</div>

          )}
        </div>
      </div>

     
       </div>      
     </div>      
           
  );
}