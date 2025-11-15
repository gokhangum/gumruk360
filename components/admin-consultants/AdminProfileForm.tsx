"use client";
import { useEffect, useRef, useState } from "react";
import TagsInput from "@/components/ui/TagsInput";

function slugify(input: string) {
  const map: Record<string,string> = {
    Ç:"C",Ö:"O",Ş:"S",İ:"I",I:"I",Ü:"U",Ğ:"G",
    ç:"c",ö:"o",ş:"s",ı:"i",i:"i",ü:"u",ğ:"g"
  };
  return (input || "")
    .split("")
    .map(ch => (map as any)[ch] || ch)
    .join("")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export default function AdminProfileForm({ workerId }: { workerId: string }) {
  const [loading, setLoading] = useState(true);
const [form, setForm] = useState<any>({
  display_name: "",
  title: "",          // (geçiş dönemi için kalsın)
  title_tr: "",       // ✅ YENİ
  title_en: "",       // ✅ YENİ
  premium_percent: 0,
  hourly_rate_tl: 0,
  hourly_rate_currency: "TRY",
  languages: ["tr"],
  tags: [],
  slug: "",
  photo_object_path: ""
});

  const [activeBase, setActiveBase] = useState<number>(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hasRecord, setHasRecord] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function refreshPhoto() {
    try {
      const r2 = await fetch(`/api/admin/consultants/${workerId}/cv/photo/url?ts=${Date.now()}`, { cache: "no-store" });
      const j2 = await r2.json();
      if (j2.ok && j2.url) setPreviewUrl(j2.url);
    } catch {}
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/pricing/active", { cache: "no-store" });
        const j = await r.json();
        if (j?.ok) setActiveBase(Number(j.base_hourly_rate || 0));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/consultants/${workerId}/cv/profile`, { cache: "no-store" });
      let j:any={}; try{ const t = await res.text(); j = t ? JSON.parse(t) : {}; } catch{}
      if (j.ok && j.data) {
  setForm((f:any) => {
    const d = j.data || {};
    return {
      ...f,
      ...d,
      title_tr: d.title_tr ?? d.title ?? f.title_tr ?? "",
      title_en: d.title_en ?? f.title_en ?? "",
    };
  });
  setHasRecord(true);
} else {
  setHasRecord(false);
}

      setLoading(false);
      await refreshPhoto();
    })();
  }, [workerId]);

  // Live hourly preview from premium & active base
  useEffect(() => {
    const p = Number(form.premium_percent ?? 0);
    const base = Number(activeBase || 0);
    if (!isFinite(p) || !isFinite(base)) return;
    const calc = Math.round(base * (1 + p/100));
    setForm((f:any) => ({ ...f, hourly_rate_tl: calc }));
  }, [form.premium_percent, activeBase]);

  async function onSave() {
    setMsg(null);
    const res = await fetch(`/api/admin/consultants/${workerId}/cv/profile`, { method: "PUT", body: JSON.stringify(form) });
    const j = await res.json();
    if (!j.ok) setMsg(j.error || "Kayıt başarısız.");
    else {
      setMsg("Kaydedildi ✔");
      setHasRecord(true);
      setTimeout(()=> setMsg(null), 2000);
    }
  }

  async function onDeleteProfile() {
    if (!confirm("Bu danışmanın CV profilini silmek istediğinize emin misiniz?")) return;
    setMsg(null);
    const res = await fetch(`/api/admin/consultants/${workerId}/cv/profile`, { method: "DELETE" });
    const j = await res.json();
    if (!j.ok) setMsg(j.error || "Silme başarısız.");
    else {
      setMsg("Profil silindi.");
      setHasRecord(false);
      setForm({
  display_name: "",
  title: "",
  title_tr: "",   // ✅
  title_en: "",   // ✅
  premium_percent: 0,
  hourly_rate_tl: activeBase || 0,
  hourly_rate_currency: "TRY",
  languages: ["tr"],
  tags: [],
  slug: "",
  photo_object_path: ""
});

      setPreviewUrl(null);
      setFile(null);
      setTimeout(()=> setMsg(null), 2000);
    }
  }

  async function onUploadPhoto() {
    if (!file) { setPhotoMsg("Lütfen bir görsel seçin."); return; }
    setPhotoMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/admin/consultants/${workerId}/cv/photo`, { method: "POST", body: fd });
    const j = await res.json();
    if (!j.ok) { setPhotoMsg(j.error || "Yükleme başarısız."); return; }
    setPhotoMsg("Fotoğraf yüklendi.");
    if (j.url) setPreviewUrl(j.url);
    else await refreshPhoto();
  }

  async function onDeletePhoto() {
    if (!confirm("Fotoğrafı silmek istediğinize emin misiniz?")) return;
    setPhotoMsg(null);
    const res = await fetch(`/api/admin/consultants/${workerId}/cv/photo`, { method: "DELETE" });
    const j = await res.json();
    if (!j.ok) setPhotoMsg(j.error || "Silinemedi.");
    else {
      setPhotoMsg("Fotoğraf silindi.");
      setPreviewUrl(null);
    }
  }

  function onPickFile() { fileInputRef.current?.click(); }
  function onChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => { if (typeof reader.result === "string") setPreviewUrl(reader.result); };
      reader.readAsDataURL(f);
    }
  }

  async function onResetHourly() {
    setMsg(null);
    const res = await fetch(`/api/admin/consultants/${workerId}/cv/profile/reset`, { method: "POST" });
    const j = await res.json();
    if (!j.ok) setMsg(j.error || "Sıfırlama başarısız.");
    else {
      // hourly base'e döner, premium da 0'lanır
      setForm((f:any) => ({ ...f, hourly_rate_tl: j.hourly_rate_tl, premium_percent: 0 }));
      setMsg("Saatlik ücret aktif tabana ve premium %0'a sıfırlandı.");
    }
  }

  if (loading) return <div>Yükleniyor...</div>;

  return (
    <div className="border rounded p-4 space-y-4">
      <div className="font-medium">Profil Bilgileri (Admin)</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span>Görünen Ad</span>
          <input className="border rounded p-2" value={form.display_name || ""} onChange={e=>setForm({...form, display_name:e.target.value})} />
        </label>
<label className="flex flex-col gap-1">
  <span>Ünvan (TR)</span>
  <input
    className="border rounded p-2"
    value={form.title_tr || ""}
    onChange={e=>setForm({...form, title_tr: e.target.value})}
    placeholder="Örn: Gümrük Müşaviri"
  />
</label>

<label className="flex flex-col gap-1">
  <span>Title (EN)</span>
  <input
    className="border rounded p-2"
    value={form.title_en || ""}
    onChange={e=>setForm({...form, title_en: e.target.value})}
    placeholder="e.g., Customs Broker"
  />
</label>


        <label className="flex flex-col gap-1">
          <span>Premium (%)</span>
          <input
            type="number"
            min={0}
            max={200}
            className="border rounded p-2"
            value={form.premium_percent ?? 0}
            onChange={e=>setForm({...form, premium_percent: Number(e.target.value)})}
          />
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span>Saat Ücreti (TL)</span>
          <div className="flex gap-2">
            <input
              type="number"
              className="border rounded p-2 flex-1 bg-gray-50"
              value={form.hourly_rate_tl ?? 0}
              readOnly
            />
            <button type="button" onClick={onResetHourly} className="px-3 py-2 border rounded-xl shadow-sm hover:bg-gray-50 transition">Reset</button>
          </div>
          <span className="text-xs text-gray-500">Aktif taban ücret: {activeBase || 0}</span>
        </label>

        <label className="flex flex-col gap-1">
          <span>Diller (virgülle)</span>
          <input className="border rounded p-2"
            value={(form.languages||[]).join(",")}
            onChange={e=>setForm({...form, languages: e.target.value.split(",").map((s:string)=>s.trim()).filter(Boolean)})} />
        </label>

        <div className="flex flex-col gap-1 col-span-full">
          <span>Etiketler</span>
          <TagsInput
            value={form.tags || []}
            onChange={(tags)=>setForm({...form, tags})}
          />
          <div className="text-xs text-gray-500">Enter veya virgül ile ekle. En fazla 10 etiket. Kelime öbeği (ör. “serbest bölge”) tek etiket sayılır.</div>
        </div>

        <label className="flex flex-col gap-1">
          <span>Slug (SEO)</span>
          <input className="border rounded p-2" value={form.slug || ""} onChange={e=>setForm({...form, slug:e.target.value})} />
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span>Fotoğraf</span>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onChangeFile} />
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 shadow-sm transition active:scale-[0.99]" onClick={onPickFile}>Dosya Seç</button>
            {previewUrl ? (
              <img src={previewUrl} alt="Önizleme" className="h-16 w-16 rounded-full object-cover border" />
            ) : (
              <div className="h-16 w-16 rounded-full border bg-gray-50 flex items-center justify-center text-xs text-gray-400">Önizleme</div>
            )}
            <button onClick={onUploadPhoto} className="px-3 py-2 bg-black text-white rounded-xl shadow-sm hover:opacity-90 transition">Fotoğraf Yükle</button>
            <button onClick={onDeletePhoto} className="px-3 py-2 border rounded-xl shadow-sm hover:bg-gray-50 transition">Fotoğrafı Sil</button>
          </div>
          {photoMsg && <div className="text-sm text-gray-600">{photoMsg}</div>}
        </label>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onSave} className="px-4 py-2 bg-black text-white rounded-xl shadow-sm hover:opacity-90 transition">Kaydet</button>
        {hasRecord && <span className="text-sm text-green-700">Kaydedildi ✔</span>}
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
      </div>
    </div>
  );
}
