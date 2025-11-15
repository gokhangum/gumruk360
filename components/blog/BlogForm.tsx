
// components/blog/BlogForm.tsx
"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import ClientLinkPanel from "@/components/blog/ClientLinkPanel";
import { slugifyTr as slugify } from "@/lib/slug";
import { autoMeta } from "@/lib/seo/autoMeta";
import RichEditor from "@/components/blog/RichEditor";
import AuthorSelector, { AuthorSelection } from "@/components/blog/AuthorSelector";

type Props = {
  mode: "create" | "edit";
  postId?: string;
  initial?: {
    tenant_id: string | null;
    lang: string;
    title: string;
    slug?: string | null;
    summary?: string | null;
    content_json: any;
    tags?: string[] | null;
    keywords?: string[] | null;
    seo_title?: string | null;
    seo_description?: string | null;
    canonical_url_override?: string | null;
    cover_image_path?: string | null;
	author_id?: string | null;
  } | null;
 tenants?: { id: string; primary_domain: string; languages?: string[] }[];
  role: "admin" | "worker" | "worker360";
    currentUser?: { id: string; full_name?: string | null; email?: string | null; avatar_url?: string | null } | null;

};
function coverPathToPublicUrl(p?: string | null): string | null {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const clean = String(p).replace(/^\/+/, '');
  const key = clean.replace(/^blog\//, ''); // "blog/" önekini tekilleştir
  return base ? `${base}/storage/v1/object/public/blog/${key}` : `/storage/v1/object/public/blog/${key}`;
}

export default function BlogForm({ mode, postId, initial, tenants = [], role, currentUser }: Props) {
const t = useTranslations("BlogForm");
	const [author, setAuthor] = useState<AuthorSelection | null>(null);
const [authorError, setAuthorError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | "">(initial?.tenant_id ?? "");
  const [lang, setLang] = useState(initial?.lang ?? "tr-TR");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [autoSlug, setAutoSlug] = useState<string>("");
  const [slug, setSlug] = useState<string>(initial?.slug ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [content, setContent] = useState<any>(initial?.content_json ?? { type: "doc", content: [] });
  const [seoTitle, setSeoTitle] = useState(initial?.seo_title ?? "");
  const [seoDesc, setSeoDesc] = useState(initial?.seo_description ?? "");
  const [keywords, setKeywords] = useState((initial?.keywords ?? []).join(","));
  const [tags, setTags] = useState((initial?.tags ?? []).join(","));
  const [coverPath, setCoverPath] = useState<string>(initial?.cover_image_path ?? "");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currentId = postId || createdId || null;
const [scheduleISO, setScheduleISO] = useState<string>("");
  // Kapak dosyası (önizleme + sil) yönetimi
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
// Yalnızca dosya seçildiğinde blob URL taşır; DB yolundan gelen önizlemeyi state’e koymuyoruz
const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);
  useEffect(() => {
    if (!coverFile) return;
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);


  const handleChooseCover = () => fileInputRef.current?.click();

  const handleCoverChange = (e: any) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    setCoverFile(f);
    setCoverRemoved(false);
    // Mevcut akışa uyum: dosya seçilince hemen yükleyelim
    handleUpload(f);
  };

  const handleRemoveCover = () => {
    setCoverFile(null);
    setCoverPreview(null);
    setCoverPath(""); // submit payload'ında null gider
    setCoverRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // DB'ye de yansıt (yerelde pid hesapla; TDZ yok)
    const pid = postId || createdId || null;
    if (pid) {
      fetch("/api/blog/cover/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: pid }),
      }).catch(() => {});

    }
  };

// İç-link seçiminde editöre bildirim (RichEditor bu olayı dinleyip seçime link uygular)
function pickInternalLink(url: string, label?: string) {
  // RichEditor.tsx içinde window.addEventListener("editor-internal-link", ...) ile karşılanacak
  window.dispatchEvent(
    new CustomEvent("editor-internal-link", { detail: { url, label } })
  );
}

// Edit sayfası açıldığında (veya yeni sayfa tekrar yüklendiğinde) mevcut author_id'yi combobox'a bas
useEffect(() => {
  const initId = initial?.author_id;
  if (!initId || author) return; // zaten seçiliyse dokunma
  fetch("/api/blog/author-options", { cache: "no-store" })
    .then(r => r.json())
    .then(res => {
      const inProfiles = (res?.profiles ?? []).find((p: any) => p.id === initId);
      if (inProfiles) { setAuthor({ kind: "profile", id: initId }); return; }
      const inAuthors  = (res?.authors  ?? []).find((a: any) => a.id === initId);
      if (inAuthors)  { setAuthor({ kind: "author",  id: initId }); return; }
    })
    .catch(() => {});
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [initial?.author_id]);

// Seçili tenant'a göre kullanılabilir diller (fallback: tüm tenant dilleri, yoksa tr/en)
const availableLangs = useMemo(() => {
  const t = tenants.find(x => x.id === tenantId);
  const langs = t?.languages?.filter(Boolean) ?? [];
  if (langs.length) return langs;
  const all = Array.from(new Set(tenants.flatMap(x => x.languages ?? []))).filter(Boolean);
  return all.length ? all : ["tr-TR", "en-US"];
}, [tenants, tenantId]);

useEffect(() => {
  if (!availableLangs.includes(lang)) {
    setLang(availableLangs[0] || "tr-TR");
  }
}, [tenantId, availableLangs]); // lang kullanıcı değiştirirse elle kalır; sadece tenant değiştiğinde düzelt
 // Başlık değiştiğinde, kullanıcı manuel bir şey yazmadıysa slug'ı otomatik üret
 useEffect(() => {
   const s = slugify(title || "");
   // Kullanıcı slug’a elle müdahale ETMEDİ ise (boşsa veya önceki autoSlug ile aynıysa) güncelle
   if (!slug || slug === autoSlug) {
     setSlug(s);
   }
   // en son otomatik ürettiğimiz değeri hatırla (manuel müdahaleyi algılayabilmek için)
   setAutoSlug(s);
}, [title, autoSlug, slug]);



  async function ensureDraftId(): Promise<string> {
    if (currentId) return currentId;
    const payload = {
      tenant_id: tenantId || null,
      lang,
       title: title || t("defaultPostTitle"),
      slug: (slug?.trim() ? slugify(slug) : slugify(title)) || null,
      summary: summary || null,
      content_json: content || { type: "doc", content: [] },
      tags: tags ? tags.split(",").map(s => s.trim()).filter(Boolean) : null,
      keywords: keywords ? keywords.split(",").map(s => s.trim()).filter(Boolean) : null,
      seo_title: seoTitle || null,
      seo_description: seoDesc || null,
      canonical_url_override: null,
    };
    const res = await fetch("/api/blog/create-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json();
   if (!json.ok) throw new Error(json.error || t("errorDraftCreate"));
    setCreatedId(json.id);
    return json.id as string;
  }

  async function handleUpload(file: File) {
    if (!file) return;
    try {
      setBusy(true);
      const pid = await ensureDraftId();
      const fd = new FormData();
      fd.append("postId", pid);
      fd.append("file", file);
      const res = await fetch("/api/blog/upload", { method: "POST", body: fd });
            const json = await res.json();
      if (!json.ok) throw new Error(json.error || t("errorUpload"));
      // 1) Local state
      setCoverPath(json.path);
      // 2) Hemen DB'ye persist (admin sayfaları DB'den okuyor)
            await fetch("/api/blog/cover/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: pid,
          objectName: json.path, // storage 'blog' içindeki object path
        }),
      }).catch(() => {});

     alert(t("coverUploaded"));
    } catch (e: any) {
     alert(e?.message || t("errorUpload"));
    } finally {
      setBusy(false);
    }
  }
async function setPostAuthor(postId: string, authorId: string) {
  const res = await fetch("/api/blog/admin/set-author", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: postId, author_id: authorId }),
  });
  const j = await res.json().catch(() => ({}));
 if (!res.ok || !j?.ok) throw new Error(j?.error || t("errorAssignAuthor"));
}

  async function onSubmit(e: any) {
    e.preventDefault();
   if (role === "admin" && !author?.id) {
      setAuthorError(t("pleaseSelectAuthor"));
      return;
    }
    setAuthorError(null);


    setBusy(true);
    try {
      const payload = {
        tenant_id: tenantId || null,
        lang, title, slug: (slug?.trim() ? slugify(slug) : slugify(title)) || null, summary: summary || null,
        content_json: content,
        tags: tags ? tags.split(",").map(s => s.trim()).filter(Boolean) : null,
        keywords: keywords ? keywords.split(",").map(s => s.trim()).filter(Boolean) : null,
        seo_title: seoTitle || null,
        seo_description: seoDesc || null,
        canonical_url_override: null,
        id: currentId ?? undefined,
        cover_image_path: coverPath || null,
		author_id: role === "admin" ? author?.id : undefined,
      };

      if (!currentId && mode === "create") {
        const res = await fetch("/api/blog/create-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const json = await res.json();
       if (!json.ok) throw new Error(json.error || t("errorGeneric"));
		        if (role === "admin" && author?.id) await setPostAuthor(json.id as string, author.id);
        const target = role === "admin" ? `/admin/blog/edit/${json.id}` : `/worker/blog/edit/${json.id}`;
        window.location.href = target;
      } else {
		        if (role === "admin" && author?.id) await setPostAuthor((currentId as string), author.id);
        const res = await fetch("/api/blog/update-mine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const json = await res.json();
             if (!json.ok) throw new Error(json.error || t("errorGeneric"));
        alert(t("saved"));
      }
    } catch (e: any) {
      alert(e?.message || t("errorSave"));
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!currentId) return alert(t("pleaseSaveFirst"));
    const res = await fetch("/api/blog/submit-for-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: currentId }) });
    const json = await res.json();
   if (!json.ok) return alert(json.error || t("errorGeneric"));
    alert(t("submittedForReview"));
  }

  async function adminPublish() {
    if (!currentId) return;
    const res = await fetch("/api/blog/admin/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: currentId }) });
    const json = await res.json();
 if (!json.ok) return alert(json.error || t("errorGeneric"));
  alert(t("published"));
  }

 async function adminSchedule() {
  if (!currentId) return;
  if (!scheduleISO) { alert(t("pickDateTime")); return; }
  const iso = scheduleISO;
  const res = await fetch("/api/blog/admin/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: currentId, iso })
  });
  const json = await res.json();
  if (!json.ok) return alert(json.error || t("errorGeneric"));
  alert(t("scheduled"));
}

// === Tiptap JSON -> düz metin (bloklar arası boşluk, inline'da bitişik) ===
function tiptapToText(node: any): string {
  function walk(n: any, parentType?: string): string {
    if (!n) return "";
    if (typeof n === "string") return n;

    if (Array.isArray(n)) {
      // Dizideki öğeleri sırayla dola; blok öğeler arasında boşluk ekle
      const parts = n.map((c) => walk(c, parentType)).filter(Boolean);
      return parts.join(parentType ? "" : " ");
    }

    if (typeof n === "object") {
      const type = n.type as string | undefined;

      // Text node
      if (typeof n.text === "string") {
        return n.text;
      }

      // İçerik
      const content = Array.isArray(n.content) ? n.content : [];
      const isBlock =
        type === "paragraph" ||
        type === "heading" ||
        type === "blockquote" ||
        type === "listItem" ||
        type === "bulletList" ||
        type === "orderedList" ||
        type === "codeBlock" ||
        type === "horizontalRule";

      const inner = content.map((c: any) => walk(c, type)).filter(Boolean);

      // Bloklar arasında bir boşluk, inline’da bitişik
      return isBlock ? inner.join(" ") : inner.join("");
    }

    return "";
  }

  // Son rötuş: çoklu boşlukları tek boşluğa indir
  return walk(node).replace(/\s+/g, " ").trim();
}


  // === “Otomatik Doldur” butonu handler'ı ===
  function handleAutoMeta() {
    const preferredLang = (lang || "tr-TR").toLowerCase().startsWith("en") ? "en" : "tr";
const m = autoMeta({
  title,
  contentText: tiptapToText(content).replace(/\s+/g, " ").trim(),
  preferredLang,
  knownTags: ["gümrük","ithalat","ihracat","beyanname","antrepo","vergiler","muafiyet","ceza"],
});
    // UI alanlarını set et
    if (!seoTitle) setSeoTitle(m.seoTitle); else setSeoTitle(m.seoTitle); // kullanıcı isterse override eder
    if (!seoDesc)  setSeoDesc(m.seoDescription); else setSeoDesc(m.seoDescription);
    if (!summary)  setSummary(m.summary); else setSummary(m.summary);
    setKeywords(m.keywords.join(","));
    setTags(m.tags.join(","));
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
           <label className="block text-sm font-medium">{t("labelLang")}</label>
          <select
            className="input input-bordered w-full rounded-lg border p-2"
            value={lang}
            onChange={e => setLang(e.target.value)}
          >
            {availableLangs.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">{t("labelTenantOptional")}</label>
          <select className="input input-bordered w-full rounded-lg border p-2"
                  value={tenantId as string}
                  onChange={e=>setTenantId(e.target.value)}>
            <option value="">{t("optionGlobal")}</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.primary_domain}</option>)}
          </select>
        </div>
      </div>
{role === "admin" ? (
  <div>
    <AuthorSelector
      label={t("labelAuthor")}
      required
      value={author}
      onChange={(sel) => {
        setAuthorError(null);
        setAuthor(sel);
      }}
    />
    {authorError && <p className="text-sm text-red-600 mt-1">{authorError}</p>}
  </div>
) : (
  <div className="mb-3">
   <label className="block text-sm font-medium mb-1">{t("labelAuthor")}</label>
    <div className="flex items-center gap-3 rounded-xl border bg-gray-50 px-3 py-2">
      {currentUser?.avatar_url ? (
        <img src={currentUser.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
      ) : null}
        <div className="text-sm">
        <div className="font-medium">
          {currentUser?.full_name}
        </div>
      </div>
    </div>
    <p className="mt-1 text-xs text-gray-500">{t("authorLocked")}</p>
  </div>
)}


      <div>
         <label className="block text-sm font-medium">{t("labelTitle")}</label>
        <input className="input input-bordered w-full rounded-lg border p-2"
               value={title} onChange={e=>setTitle(e.target.value)} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
           <label className="block text_sm font-medium">{t("labelSlugOptional")}</label>
         <input
  className="input input-bordered w-full rounded-lg border p-2"
   value={slug ?? ""}
   onChange={e => {
     const v = e.target.value;
     setSlug(v);
     // kullanıcı artık manuel yazıyor; autoSlug'ı da bu değere çekip otomatik güncellemeyi durduruyoruz
     setAutoSlug(v);
   }}
 />
        </div>
        <div>
          <label className="block text-sm font-medium">{t("labelSummary")}</label>
          <input className="input input-bordered w-full rounded-lg border p-2"
                 value={summary ?? ""} onChange={e=>setSummary(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("labelContent")}</label>
                <RichEditor
          postId={(currentId ?? "") as string}
          value={content}
          onChange={setContent}
        />
      </div>
      {/* İç link ekleme paneli (hydration farkını önlemek için sadece mount sonrası) */}
      {isMounted && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3">
          <label className="block text-sm font-medium mb-1">{t("labelSearchInternalLink")}</label>
          <ClientLinkPanel
            baseUrl={window.location.origin}
            onPick={(url, title) => pickInternalLink(url, title)}
          />
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleAutoMeta}
          className="btn btn--sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5"
          disabled={busy}
        >
         {t("btnAutoMeta")}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium">{t("labelseotitle")}</label>
          <input className="input input-bordered w-full rounded-lg border p-2"
                 value={seoTitle} onChange={e=>setSeoTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">{t("labelseodesc")}</label>
          <input className="input input-bordered w-full rounded-lg border p-2"
                 value={seoDesc} onChange={e=>setSeoDesc(e.target.value)} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
         <label className="block text-sm font-medium">{t("labelKeywordsComma")}</label>
          <input className="input input-bordered w-full rounded-lg border p-2"
                 value={keywords} onChange={e=>setKeywords(e.target.value)} />
        </div>
        <div>
        <label className="block text-sm font-medium">{t("labelTagsComma")}</label>
          <input className="input input-bordered w-full rounded-lg border p-2"
                 value={tags} onChange={e=>setTags(e.target.value)} />
        </div>
      </div>

      <div className="mt-2">
        <label className="block text-sm font-medium mb-1">{t("labelCoverImage")}</label>

        {/* Native input gizli; butonlar burayı tetikler */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCoverChange}
          disabled={busy}
        />

{(() => {
  // DB’deki path → public URL (SSR ve client’ta aynı hesap)
  const dbCoverUrl = coverPathToPublicUrl(coverPath || initial?.cover_image_path || null);
  // Öncelik: kullanıcı dosya seçtiyse blob önizleme, değilse DB’den gelen URL
  const previewUrl = coverPreview || dbCoverUrl;

  if (!previewUrl) {
    return (
      <button
        type="button"
        onClick={handleChooseCover}
        className="w-full rounded-xl border border-dashed border-gray-300 p-6 text-center hover:bg-gray-50 transition"
        disabled={busy}
      >
            <div className="text-sm text-gray-700 font-medium">{t("pickImage")}</div>
        <div className="text-xs text-gray-500 mt-1">{t("imageHint")}</div>
      </button>
    );
  }

  return (
    <div className="relative">
      <img
        src={previewUrl}
        alt={t("coverAlt")}
        className="w-full max-h-72 object-cover rounded-xl border"
        suppressHydrationWarning
      />
      <div className="absolute bottom-3 right-3 flex gap-2">
        <button
          type="button"
          onClick={handleChooseCover}
          className="rounded-lg bg-white/90 px-3 py-1.5 text-sm shadow hover:bg-white transition"
          disabled={busy}
        >
           {t("btnChange")}
        </button>
        <button
          type="button"
          onClick={handleRemoveCover}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white shadow hover:bg-red-700 transition"
          disabled={busy}
        >
           {t("btnDelete")}
        </button>
      </div>
    </div>
  );
})()}


        {/* Bilgi satırları (opsiyonel) */}
         {currentId && <div className="text-xs text-gray-600 mt-2">{t("draftId")}: {currentId}</div>}
      {coverPath && <div className="text-xs text-gray-600 break-all mt-1">{t("coverPath")}: {coverPath}</div>}
      </div>

      <div className="flex gap-2">
       <button disabled={busy} className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm">{t("save")}</button>
        {role !== "admin" && (
          <button type="button" disabled={busy} className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 text-sm"
                  onClick={submitForReview}>
           {t("submitForReview")}
          </button>
        )}
        {role === "admin" && (
          <>
            <button type="button" disabled={busy || !currentId} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 text-sm"
                    onClick={adminPublish}>
              {t("publish")}
            </button>
			<input
  type="datetime-local"
  className="input input-sm border rounded-md px-2 py-1"
  value={scheduleISO}
  onChange={e => setScheduleISO(e.target.value)}
/>
            <button type="button" disabled={busy || !currentId} className="rounded-lg bg-yellow-600 hover:bg-yellow-700 disabled:opacity-60 text-white px-4 py-2 text-sm"
                    onClick={adminSchedule}>
               {t("schedule")}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
