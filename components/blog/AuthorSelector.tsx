"use client";

import React from "react";
import { fetchAuthorOptions, createAuthor, uploadAuthorAvatar, ProfileOption, AuthorOption } from "@/lib/blog/authors";
 import { useTranslations } from "next-intl";
 import RichEditor from "@/components/blog/RichEditor";
type SelectedKind = "profile" | "author" | "";

export type AuthorSelection = {
  kind: SelectedKind;   // profile | author
  id: string;           // profiles.id OR blog_authors.id
};

type Props = {
  label?: string;
  value?: AuthorSelection | null;
  onChange: (sel: AuthorSelection | null) => void;
  required?: boolean;
};

const NEW_AUTHOR_SENTINEL = "__NEW_AUTHOR__";

export default function AuthorSelector({ label, value, onChange, required }: Props) {
  const [loading, setLoading] = React.useState(false);
 const t = useTranslations("AuthorSelector");
  const labelText = label ?? t("label");
  const [profiles, setProfiles] = React.useState<ProfileOption[]>([]);
  const [authors, setAuthors] = React.useState<AuthorOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [showNew, setShowNew] = React.useState(false);

  // New author form state
  const [name, setName] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [bio, setBio] = React.useState<any | null>(null);
const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  React.useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetchAuthorOptions()
      .then((res) => {
        if (!isMounted) return;
        setProfiles(res.profiles || []);
        setAuthors(res.authors || []);
      })
      .catch((e) => setError(e.message || t("loadError")))
      .finally(() => setLoading(false));
    return () => { isMounted = false; };
  }, []);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "") {
      onChange(null);
      return;
    }
    if (val === NEW_AUTHOR_SENTINEL) {
      setShowNew(true);
      return;
    }
    // value encoding: kind:id
    const [kind, id] = val.split(":", 2);
    onChange({ kind: kind as any, id });
  };

  const encodedValue = React.useMemo(() => {
    if (!value) return "";
    return `${value.kind}:${value.id}`;
  }, [value]);

const submitNewAuthor = async () => {
    if (!name.trim()) {
    setError(t("pleaseEnterAuthorName"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
     const res = await createAuthor({
       name: name.trim(),
        title: title.trim() || null,
        bio: bio ? JSON.stringify(bio) : null,
      });
       const a = res.author as AuthorOption;
	  // Avatar seçilmişse dosyayı yükle
if (avatarFile) {
  try {
    await uploadAuthorAvatar({ authorId: a.id, file: avatarFile });
  } catch (e: any) {
    // Avatar yüklenemese bile yazar kaydı seçilsin; hatayı gösterelim
    setError(e?.message || t("avatarUploadFailed"));
  }
}

      // Add to local list & select it
      setAuthors((prev) => [...prev, a]);
      onChange({ kind: "author", id: a.id });
      setShowNew(false);
setName("");
setTitle("");
setBio(null);
setAvatarFile(null);
setAvatarPreview(null);
    } catch (e: any) {
      setError(e?.message || t("saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
     <label className="block text-sm font-medium text-gray-700">
    {labelText}{required ? " *" : ""}
   </label>
      <select
        className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm"
        value={encodedValue}
        onChange={handleSelect}
        disabled={loading}
      >
        <option value="">{loading ? t("loading") : t("selectAuthor")}</option>

        {profiles.length > 0 && (
          <optgroup label={t("groupProfiles")}>
            {profiles.map((p) => (
              <option key={p.id} value={`profile:${p.id}`}>
                {p.full_name || p.id}{p.title ? ` — ${p.title}` : ""}
              </option>
            ))}
          </optgroup>
        )}

        {authors.length > 0 && (
          <optgroup label={t("groupCustomAuthors")}>
            {authors.map((a) => (
              <option key={a.id} value={`author:${a.id}`}>
                {a.name}{a.title ? ` — ${a.title}` : ""}
              </option>
            ))}
          </optgroup>
        )}

        <option value={NEW_AUTHOR_SENTINEL}>{t("addNew")}</option>
      </select>

     {showNew && (
   <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2" role="group" aria-label={t("addNewAria")}>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-700">{t("authorName")} *</label>
            <input
              className="rounded-md border border-gray-300 bg-white p-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("authorNamePh")}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
           <label className="text-sm text-gray-700">{t("titleOptional")}</label>
            <input
              className="rounded-md border border-gray-300 bg-white p-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePh")}
            />
          </div>
          <div className="flex flex-col gap-1">
                   <label className="text-sm text-gray-700">{t("bioOptional")}</label>
           <RichEditor
             value={bio}
              onChange={setBio}
             placeholder={t("bioPh")}
          />

          </div>
		  {/* Avatar (opsiyonel) */}
<div className="flex flex-col gap-2">
  <label className="text-sm text-gray-700">{t("avatarOptional")}</label>

  <div className="flex items-start gap-3">
    <div className="w-16 h-16 rounded-full overflow-hidden border bg-gray-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {avatarPreview ? (
        <img src={avatarPreview} alt={t("previewAlt")} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full grid place-items-center text-[10px] text-gray-400">{t("none")}</div>
      )}
    </div>

    <div className="flex-1">
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="block w-full text-sm"
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          setAvatarFile(f);
          if (f) {
            const url = URL.createObjectURL(f);
            setAvatarPreview((old) => {
              if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
              return url;
            });
          } else {
            setAvatarPreview(null);
          }
        }}
      />
      <p className="text-xs text-gray-500 mt-1">{t("avatarHint")}</p>
    </div>
  </div>
</div>

          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex items-center gap-2">
          <button
        type="button"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5"
             disabled={loading}
         onClick={submitNewAuthor}
       >
         {t("saveAndSelect")}
       </button>
	   <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm px-3 py-1.5"
              onClick={() => setShowNew(false)}
              disabled={loading}
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}