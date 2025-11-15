
// components/worker-cv/ProfileForm.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import TagsInput from "@/components/ui/TagsInput";
import { useTranslations } from "next-intl";
type WForm = {
  display_name?: string;
  title_tr?: string;
  title_en?: string;
  tags?: string[];
  photo_object_path?: string | null;
};

export default function ProfileForm() {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<WForm>({
    display_name: "",
    title_tr: "",
    title_en: "",
    tags: [],
    photo_object_path: null,
  });

  const [msg, setMsg] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hasRecord, setHasRecord] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
const t = useTranslations('workerCv.profile');
  async function refreshPhoto() {
    try {
      const r2 = await fetch(`/api/worker/cv/photo/url?ts=${Date.now()}`, { cache: "no-store" });
      const j2 = await r2.json();
      if (j2.ok && j2.url) setPreviewUrl(j2.url);
    } catch {}
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/worker/cv/profile`, { cache: "no-store" });
        let j:any={}; try{ const t=await res.text(); j = t ? JSON.parse(t) : {}; }catch{}
        if (j.ok && j.data) {
          const d = j.data || {};
          setForm((f)=> ({
            ...f,
            ...d,
            title_tr: d.title_tr ?? d.title ?? f.title_tr ?? "",
            title_en: d.title_en ?? f.title_en ?? "",
          }));
          setHasRecord(true);
        } else {
          setHasRecord(false);
        }
      } finally {
        setLoading(false);
        await refreshPhoto();
      }
    })();
  }, []);

  async function onSave() {
    setMsg(null);
    const res = await fetch(`/api/worker/cv/profile`, { method: "PUT", body: JSON.stringify(form) });
    const j = await res.json().catch(()=>({ ok:false }));
    if (!j.ok) setMsg(j.error || t('messages.saveFailed'));
    else {
      setMsg(t('messages.saved'));
      setHasRecord(true);
      setTimeout(()=> setMsg(null), 2000);
    }
  }

  function onPickFile() { fileInputRef.current?.click(); }

  function onChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (f) {
      // Geçici önizleme (Admin tarafındaki gibi)
      const reader = new FileReader();
      reader.onload = () => { if (typeof reader.result === "string") setPreviewUrl(reader.result); };
      reader.readAsDataURL(f);
    }
  }

  async function onUploadPhoto() {
    if (!file) { setPhotoMsg(t('messages.selectImage')); return; }
    setPhotoMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/worker/cv/photo`, { method: "POST", body: fd });
    const j = await res.json().catch(()=>({ ok:false }));
    if (!j.ok) { setPhotoMsg(j.error || t('messages.uploadFailed')); return; }
    setPhotoMsg(t('messages.photoUploaded'));
    if (j.url) setPreviewUrl(j.url);
    else await refreshPhoto();
  }

  async function onDeletePhoto() {
    if (!confirm(t('messages.deleteConfirm'))) return;
    setPhotoMsg(null);
    const res = await fetch(`/api/worker/cv/photo`, { method: "DELETE" });
    const j = await res.json().catch(()=>({ ok:false }));
    if (!j.ok) setPhotoMsg(j.error || t('messages.deleteFailed'));
    else {
      setPhotoMsg(t('messages.photoDeleted'));
      setPreviewUrl(null);
      setForm((f)=> ({ ...f, photo_object_path: null }));
    }
  }

  if (loading) return <div>{t('loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span>{t('labels.displayName')}</span>
          <input
            className="border rounded p-2"
            value={form.display_name || ""}
            onChange={e=>setForm({ ...form, display_name:e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span>{t('labels.titleTR')}</span>
          <input
            className="border rounded p-2"
            value={form.title_tr || ""}
            onChange={e=>setForm({ ...form, title_tr:e.target.value })}
            placeholder={t('placeholders.titleTR')}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span>{t('labels.titleEN')}</span>
          <input
            className="border rounded p-2"
            value={form.title_en || ""}
            onChange={e=>setForm({ ...form, title_en:e.target.value })}
            placeholder={t('placeholders.titleEN')}
          />
        </label>

        <div className="flex flex-col gap-1 col-span-full">
         <span>{t('labels.tags')}</span>
          <TagsInput
            value={form.tags || []}
            onChange={(tags)=>setForm({ ...form, tags })}
          />
          <div className="text-xs text-gray-500">
          {t('tags.help')}
          </div>
        </div>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span>{t('labels.photo')}</span>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onChangeFile} />
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 shadow-sm transition active:scale-[0.99]" onClick={onPickFile}>{t('buttons.chooseFile')}</button>
            {previewUrl ? (
              <img src={previewUrl} alt={t('ui.previewAlt')} className="h-16 w-16 rounded-full object-cover border" />
            ) : (
              <div className="h-16 w-16 rounded-full border bg-gray-50 flex items-center justify-center text-xs text-gray-400">{t('ui.preview')}</div>
            )}
            <button onClick={onUploadPhoto} className="px-3 py-2 bg-black text-white rounded-xl shadow-sm hover:opacity-90 transition">{t('buttons.uploadPhoto')}</button>
            <button onClick={onDeletePhoto} className="px-3 py-2 border rounded-xl shadow-sm hover:bg-gray-50 transition">{t('buttons.deletePhoto')}</button>
          </div>
          {photoMsg && <div className="text-sm text-gray-600">{photoMsg}</div>}
        </label>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onSave} className="px-4 py-2 bg-black text-white rounded-xl shadow-sm hover:opacity-90 transition">{t('buttons.save')}</button>
        {hasRecord && <span className="text-sm text-green-700">{t('messages.saved')}</span>}
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
      </div>
    </div>
  );
}
