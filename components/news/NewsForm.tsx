// components/news/NewsForm.tsx
"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { slugifyTr as slugify } from "@/lib/slug";
import RichEditor from "@/components/blog/RichEditor";
import { autoMeta } from "@/lib/seo/autoMeta";
import Modal from "@/components/ui/Modal"; // popup modal
type Tenant = { id: string; name: string | null; primary_domain: string | null };
type Props = {
  mode: "create" | "edit";
  initial?: any | null;
  tenants?: Tenant[];
};

export default function NewsForm({ mode, initial, tenants = [] }: Props) {
  const [tenantId, setTenantId] = useState<string | "">(initial?.tenant_id || "");
   const [title, setTitle] = useState<string>(initial?.title || "");
  const [slug, setSlug] = useState<string>(initial?.slug || "");
 const [recordId, setRecordId] = useState<string>(initial?.id ?? ""); // eklendi
  const [lang, setLang] = useState<"tr"|"en">(initial?.lang || "tr");
  const [summary, setSummary] = useState<string>(initial?.summary || "");

  const [cover, setCover] = useState<string | null>(initial?.cover_image_path || null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [content, setContent] = useState<any>(initial?.content_json || { type: "doc", content: [] });
  const [isPublished, setIsPublished] = useState<boolean>(initial?.is_published ?? true);
  const [isPinned, setIsPinned] = useState<boolean>(initial?.is_pinned ?? false);
  const [seoTitle, setSeoTitle] = useState<string>(initial?.seo_title || "");
  const [seoDesc, setSeoDesc] = useState<string>(initial?.seo_description || "");
  const [keywords, setKeywords] = useState<string>((initial?.keywords || []).join(", "));
  const [savingDraft, setSavingDraft] = useState<boolean>(false);
const [savingPublish, setSavingPublish] = useState<boolean>(false);
 const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
 const [confirmOpen, setConfirmOpen] = useState(false);                         // eklendi
 const [confirmKind, setConfirmKind] = useState<"saved" | "published">("saved"); // eklendi

  const [deleting, setDeleting] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
// Kullanıcı manuel girdi mi? (üzerine yazmamak için)
const [slugTouched, setSlugTouched] = useState(false);
const [summaryTouched, setSummaryTouched] = useState(false);
const [seoDescTouched, setSeoDescTouched] = useState(false);

// Başlıktan TR normalize slug (blog tarafındaki gibi)
const autoSlug = useMemo(() => slugify(title || ""), [title]);

// Slug elle girilmediyse başlık değiştikçe doldur
useEffect(() => {
  if (!slug || !slugTouched) {
    setSlug(autoSlug);
  }
}, [autoSlug, slug, slugTouched]);

// Başlık/özet değişince SEO başlık & açıklama (elle dokunulmadıysa) güncelle
 useEffect(() => {
  if (seoDescTouched) return;
  const text = extractPlainText(content);
   const baseText = [summary, text].filter(Boolean).join(" ");
  const meta = autoMeta({
     title,
     contentText: baseText || null,
     preferredLang: lang,
   });
   if (!seoTitle) setSeoTitle(meta.seoTitle || title);
   if (!seoDesc) setSeoDesc(meta.seoDescription || summary || makeSummary(text || summary, 160));
   // keywords'ü otomatik doldurmak istersen, elle girilmediyse benzer kontrolle set edebilirsin.
 }, [title, summary, lang]); // content de etkilesin dersen dependency'e content ekleyebilirsin
 

   function handleAutoSeo() {
    const text = extractPlainText(content);
     const baseText = [summary, text].filter(Boolean).join(" ");
    const meta = autoMeta({
      title,
     contentText: baseText || null,
      preferredLang: lang,
     });
    if (!seoTitle) setSeoTitle(meta.seoTitle || title);
     if (!seoDesc) setSeoDesc(meta.seoDescription || summary || "");
    if (!keywords) setKeywords((meta.keywords || []).join(", "));
  }

  function previewHref() {
    const s = (slug || slugify(title)).trim();
    const path = `/news/${s}`;
    const t = tenants.find(t => t.id === tenantId);
    if (t?.primary_domain) {
      const proto = t.primary_domain.startsWith("http") ? "" : "https://";
      return `${proto}${t.primary_domain.replace(/\/$/, "")}${path}`;
    }
    return path;
  }

  async function onSubmit(publish: boolean) {
  // Publish mi Draft mı? İki ayrı spinner da gösterelim:
  if (publish) setSavingPublish(true); else setSavingDraft(true);
  setSaving(true);
  setError(null);
  try {
    const nowIso = new Date().toISOString();
    const payload = {
      tenant_id: tenantId || null,
      title,
      slug: slug || slugify(title),
      lang,
      summary,
      content_json: content,
      cover_image_path: cover,
      // Buton aksiyonuna göre yayın durumu:
      is_published: publish ? true : false,
      // Yayınla: şimdi; Kaydet: null (taslak)
      published_at: publish ? nowIso : null,
      is_pinned: isPinned,
      seo_title: seoTitle || null,
      seo_description: seoDesc || null,
      keywords: keywords ? keywords.split(",").map(s=>s.trim()).filter(Boolean) : null,
    };

    const url = mode === "create" ? "/api/news/create" : "/api/news/update";
    const finalPayload = mode === "create" ? payload : { id: initial.id, ...payload };
    const r = await fetch(url, { method: "POST", body: JSON.stringify(finalPayload) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Failed");
    // Yönlendirme yok → popup + state güncelle
    if (j.id) setRecordId(j.id);                      // ilk kayıttan sonra RichEditor için ID
     setConfirmKind(publish ? "published" : "saved");  // popup modu
    setConfirmOpen(true);                             // popup aç
   } catch (e:any) {

    setError(e.message || "Unexpected error");
  } finally {
    setSaving(false);
    setSavingDraft(false);
    setSavingPublish(false);
  }
}


  async function onDelete() {
    if (mode !== "edit") return;
    if (!confirm("Bu haberi silmek istediğinden emin misin?")) return;
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch("/api/news/delete", { method: "POST", body: JSON.stringify({ id: initial.id }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Delete failed");
      // Optionally remove cover file too (if exists)
      if (cover) await fetch("/api/news/remove-file", { method: "POST", body: JSON.stringify({ path: cover }) });
      window.location.href = "/admin/news";
    } catch (e:any) {
      setError(e.message || "Unexpected error");
    } finally {
      setDeleting(false);
    }
  }

  function askFile() {
    fileRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCoverPreview(URL.createObjectURL(f)); // instant local preview
    setUploading(true);
    try {
const safeName = f.name.replace(/[^a-zA-Z0-9._-]+/g, "_");

 // ID varsa: <id>, yoksa by-slug/<slug>  (NOT: bucket adı burada OLMAYACAK)
 const baseSlug = (slug || slugify(title) || "untitled").trim();
 const folder = initial?.id
   ? `${initial.id}`
   : `by-slug/${baseSlug}`;
 

// Uzantıyı belirle (dosya adında yoksa MIME’dan al)
const ext = safeName.includes(".")
  ? ""
  : "." + ((f.type && f.type.split("/")[1]) || "jpg");

// Benzersiz bir dosya adı (capakların önüne geçmek için timestamp ekle)
const filename = `cover-${Date.now()}${ext}`;
const path = `${folder}/${filename}`.replace(/\.+\./g, ".");

      const fd = new FormData();
      fd.append("file", f);
      fd.append("path", path);
      const r = await fetch("/api/news/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Upload failed");
      setCover(j.path); // storage path
setCoverPreview(j.publicUrl || coverPreview); // varsa public URL ile anında önizleme
      // Optional: could set coverPreview to j.publicUrl, but local blob is fine until reload
    } catch (e:any) {
      setError(e.message || "Upload error");
      setCoverPreview(null);
    } finally {
      setUploading(false);
      // reset input value so the same file can be re-selected
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeCover() {
    if (!cover) { setCover(null); setCoverPreview(null); return; }
    if (!confirm("Kapak görselini kaldırmak istiyor musun?")) return;
    try {
      await fetch("/api/news/remove-file", { method: "POST", body: JSON.stringify({ path: cover }) });
    } catch {}
    setCover(null);
    setCoverPreview(null);
  }

  const coverPublicUrl = cover
     ? (process.env.NEXT_PUBLIC_SUPABASE_URL
         ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/news/${cover}`
       : `/storage/v1/object/public/news/${cover}`)
    : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Tenant (yayınlanacağı site)</label>
          <select value={tenantId} onChange={e=>setTenantId(e.target.value)} className="w-full border rounded-lg p-2">
            <option value="">Global (tüm siteler)</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>
                {(t.name || t.primary_domain || t.id)}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Seçili tenant alan adında listelenir. Boş bırakılırsa global görünür.</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Dil</label>
          <select value={lang} onChange={e=>setLang(e.target.value as any)} className="w-full border rounded-lg p-2">
            <option value="tr">tr</option>
            <option value="en">en</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Slug</label>
          <input
   value={slug}
   onChange={e => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
   className="w-full border rounded-lg p-2"
 />
        </div>
        <div className="md:col-span-3">
          <label className="block text-sm font-medium mb-1">Başlık</label>
          <input value={title} onChange={e=>setTitle(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div className="md:col-span-3">
          <label className="block text-sm font-medium mb-1">Özet</label>
          <textarea
   value={summary}
   onChange={e => { setSummary(e.target.value); setSummaryTouched(true); }}
   rows={3}
   className="w-full border rounded-lg p-2"
 />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">İçerik</label>
        <div className="rounded-2xl border border-gray-200 shadow-sm bg-white">
          <RichEditor
		   postId={recordId}
        entity="news"
		
        value={content}
        onChange={(v: any) => {
          setContent(v);
          const text = extractPlainText(v);

          if (!summaryTouched && (!summary || summary.length < 10)) {
            setSummary(makeSummary(text, 200));
          }

          if (!seoDescTouched && !seoDesc) {
            const baseText = [summary || makeSummary(text, 160), text]
              .filter(Boolean)
              .join(" ");

            const meta = autoMeta({
              title,
              contentText: baseText || null,
              preferredLang: lang,
            });

            setSeoDesc(
              meta.seoDescription ||
                summary ||
                makeSummary(text, 160)
            );
          }
        }}
    
        uploadBase="news"
       
      />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Kapak görseli</label>
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            <button type="button" onClick={askFile} className="px-3 py-2 rounded-lg border">Dosya Seç</button>
            {cover && (
              <button type="button" onClick={removeCover} className="px-3 py-2 rounded-lg border border-red-600 text-red-600">
                Kaldır
              </button>
            )}
            {uploading && <span className="text-sm text-gray-500">Yükleniyor…</span>}
          </div>
          {cover || coverPreview ? (
            <div className="mt-3">
              <img
                src={coverPreview || coverPublicUrl || ""}
                alt="Kapak önizleme"
                className="h-20 w-32 object-cover rounded-md border border-gray-200"
              />
            </div>
          ) : null}
          {cover && (
            <p className="text-xs text-gray-500 mt-1 break-all">{cover}</p>
          )}
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-3 text-sm select-none cursor-pointer">
            <span>Yayında</span>
            <span
              onClick={()=>setIsPublished(v=>!v)}
              className={"relative inline-flex h-6 w-11 items-center rounded-full transition-colors " + (isPublished ? "bg-green-500" : "bg-gray-300")}
              role="switch"
              aria-checked={isPublished}
              tabIndex={0}
              onKeyDown={(e)=>{ if(e.key==='Enter'||e.key===' ') setIsPublished(v=>!v); }}
            >
              <span
                className={"inline-block h-5 w-5 transform rounded-full bg-white transition-transform " + (isPublished ? "translate-x-5" : "translate-x-1")}
              />
            </span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">SEO Title</label>
          <input value={seoTitle} onChange={e=>setSeoTitle(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">SEO Description</label>
           <input
  value={seoDesc}
  onChange={e => { setSeoDesc(e.target.value); setSeoDescTouched(true); }}
   className="w-full border rounded-lg p-2"
 />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Keywords (virgülle)</label>
          <input value={keywords} onChange={e=>setKeywords(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
      </div>

     <div className="flex flex-wrap items-center gap-3">
  <button type="button" onClick={handleAutoSeo} className="px-3 py-2 rounded-lg border">
    SEO'yu Otomatik Doldur
  </button>
  <a href={previewHref()} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-lg border">
    Önizleme
  </a>

  {/* Kaydet → Taslak */}
  <button
    type="button"
    onClick={() => onSubmit(false)}
    disabled={saving || savingDraft}
    className="px-4 py-2 rounded-lg border"
  >
    {savingDraft ? "Kaydediliyor..." : "Kaydet"}
  </button>

  {/* Yayınla → is_published=true */}
  <button
    type="button"
    onClick={() => onSubmit(true)}
    disabled={saving || savingPublish}
    className="px-4 py-2 rounded-lg bg-blue-600 text-white"
  >
    {savingPublish ? "Yayınlanıyor..." : "Yayınla"}
  </button>

  {mode === "edit" && (
    <button
      type="button"
      onClick={onDelete}
      disabled={deleting}
      className="px-3 py-2 rounded-lg border border-red-600 text-red-600"
    >
      {deleting ? "Siliniyor..." : "Sil"}
    </button>
  )}
 </div>
 
 {/* Kaydet/Yayınla sonrası blogdaki gibi popup */}
  <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)}>
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">
      {confirmKind === "published" ? "Yayınlandı" : "Kaydedildi"}
     </h3>
      <p className="text-sm text-gray-600">
        {confirmKind === "published"
         ? "Haber başarıyla yayınlandı."
          : "Taslak başarıyla kaydedildi."}
     </p>
      <div className="pt-2">
       <button type="button" onClick={() => setConfirmOpen(false)} className="px-4 py-2 rounded-lg bg-blue-600 text-white">
         Tamam
       </button>
     </div>
   </div>
 </Modal>

 
 {error && <div className="text-red-600 text-sm">{error}</div>}
     </div>

  );
}
// İçerikten kısa ve cümle bütünlüğünü bozmamaya çalışan özet üretimi
function makeSummary(text: string, max = 200) {
  const t = (text || "").trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  // mümkünse kelime ortasında kesme
  return cut.replace(/\s+\S*$/, "");
}

// Extract plain text for auto SEO from TipTap JSON
function extractPlainText(doc:any): string {
  if (!doc) return "";
  const res: string[] = [];
  function walk(n:any) {
    if (!n) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === "object") {
      if (n.type === "text" && n.text) res.push(n.text);
      if (n.content) walk(n.content);
    }
  }
  walk(doc);
  return res.join(" ").replace(/\s+/g, " ").trim();
}