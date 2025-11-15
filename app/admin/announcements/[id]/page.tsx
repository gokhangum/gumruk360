import { notFound } from "next/navigation"
import { supabaseServer } from "../../../../lib/supabase/server"

export default async function AdminAnnouncementDetail(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;                // <-- kritik satır
  const supabase = await supabaseServer()

  const { data: ann } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", id)
    .single()
  if (!ann) return notFound()

  const { data: files } = await supabase
    .from("announcement_attachments")
    .select("object_path,file_name,mime")
    .eq("announcement_id", id)

  // İmzalı URL'leri hazırla
  const signedLinks: Array<{ name: string; url: string }> = []
  if (files && files.length > 0) {
    for (const f of files) {
      const { data: signed } = await supabase.storage
        .from("attachments")
        .createSignedUrl(f.object_path as string, 60 * 10)
      if (signed?.signedUrl) {
        signedLinks.push({ name: (f.file_name as string) || "file", url: signed.signedUrl })
      }
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Duyuru Detayı</h1>
        <a href="/admin/announcements" className="text-sm underline">Listeye dön</a>
      </div>

      <div className="grid gap-3 text-sm">
        <div><span className="font-medium">ID:</span> {ann.id}</div>
        <div><span className="font-medium">Durum:</span> {ann.status === "published" ? "Yayında" : "Taslak"}</div>
        <div><span className="font-medium">Dil:</span> {ann.lang?.toUpperCase()}</div>
        <div><span className="font-medium">Tür:</span> {ann.type === "news" ? "Haber" : "Bildirim"}</div>
        <div><span className="font-medium">Başlık:</span> {ann.title}</div>
        <div>
          <span className="font-medium">Oluşturulma:</span> {new Date(ann.created_at).toLocaleString()}
          {ann.published_at && (
            <>
              {" "}<span className="font-medium">• Yayınlanma:</span> {new Date(ann.published_at).toLocaleString()}
            </>
          )}
        </div>
      </div>

      <div className="border rounded">
        <div className="border-b px-3 py-2 bg-gray-50 text-sm font-medium">İçerik</div>
        <div className="p-3 prose max-w-none" dangerouslySetInnerHTML={{ __html: ann.body }} />
      </div>

      <div className="border rounded">
        <div className="border-b px-3 py-2 bg-gray-50 text-sm font-medium">Ekler</div>
        <div className="p-3 space-y-2">
          {signedLinks.length > 0 ? (
            signedLinks.map((f, i) => (
              <div key={i}>
                <a className="text-blue-700 underline" href={f.url} target="_blank" rel="noreferrer">
                  {f.name}
                </a>
              </div>
            ))
          ) : (
            <div className="text-gray-500 text-sm">Ek yok.</div>
          )}
        </div>
      </div>
    </div>
  )
}
