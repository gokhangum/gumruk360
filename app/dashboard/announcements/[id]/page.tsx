import { notFound } from "next/navigation";
import { supabaseServer } from "../../../../lib/supabase/server";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { getTranslations } from "next-intl/server";
type FileRow = { object_path: string | null; file_name: string | null; mime: string | null };
type SignedRow = { name: string; url: string };


export default async function AnnouncementDetailPage(
  { params }: { params: Promise<{ id: string }> }
)
 {
  const { id } = await params;


  // User-facing client (session), only for auth & reads that should honor RLS
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user?.id) return notFound();
const t = await getTranslations("ann");

  // Duyuruyu getir (RLS'li)
  const { data: ann } = await supabase
    .from("announcements")
    .select("id,created_at,title,body")
    .eq("id", id)
    .single();
  if (!ann) return notFound();

  // === Ekler ===
  // 1) Önce DB tablosundan admin ile çek (RLS bypass)
  const signedLinks: SignedRow[] = [];


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
        signedLinks.push({ name: f.file_name || key.split("/").pop() || "file", url: signed.signedUrl, key } as any);
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
         if (signed?.signedUrl) signedLinks.push({ name: obj.name, url: signed.signedUrl, key } as any);
        }
        if (signedLinks.length > 0) break;
      }
    }
  }

  // Okundu işareti (RLS'li)
  await supabase
    .from("announcement_reads")
    .upsert(
      { announcement_id: ann.id, user_id: u.user.id, read_at: new Date().toISOString() },
      { onConflict: "announcement_id,user_id" }
    );

  return (

  <div className="w-full max-w-none md:max-w-[clamp(320px,90vw,928px)] -mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
     <div className="card-surface shadow-colored p-5 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">{ann.title}</h1>
      <a href="/dashboard/announcements" className="btn btn--ghost text-sm">{t("detail.back")}</a>

      </div>

      <div className="text-sm text-gray-600">{new Date(ann.created_at).toLocaleString()}</div>

     <div className="card-surface rounded-xl overflow-hidden edge-underline edge-blue edge-taper edge-rise-2mm">
        <div className="flex items-center justify-between border-b px-4 py-2 text-sm font-semibold">{t("detail.content")}</div>

       <div className="p-4 prose max-w-none" dangerouslySetInnerHTML={{ __html: ann.body }} />
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
