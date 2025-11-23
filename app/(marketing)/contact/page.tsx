"use client";

import React from "react";
import Image from "next/image";     
import { Linkedin, Twitter, Instagram } from "lucide-react"; 
import { useTranslations, useLocale } from "next-intl";
import { tenantFromHost, getSocialLinks, type SocialLinks } from "@/lib/brand";

type Status = { ok: boolean; message: string; ref?: string; errors?: Record<string, string> };

export default function ContactPage() {
  const t = useTranslations("contactmain");
  const locale = useLocale();
  const telImageSrc = locale === "tr" ? "/tel/tr_tel.png" : "/tel/eng_tel.png";
  const [status, setStatus] = React.useState<Status | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);
  const dzRef = React.useRef<HTMLLabelElement | null>(null);
 const [social, setSocial] = React.useState<SocialLinks | null>(null);

 React.useEffect(() => {
   if (typeof window === "undefined") return;
   const host = window.location.hostname;
   const tenant = tenantFromHost(host);
  setSocial(getSocialLinks(tenant));
 }, []);

  function onFilesSelected(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (let i = 0; i < list.length; i++) {
      const f = list.item(i);
      if (f) next.push(f);
    }
    setFiles(next);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.files?.length) {
      onFilesSelected(e.dataTransfer.files);
    }
    dzRef.current?.classList.remove("ring-2", "ring-amber-500/60", "bg-amber-50/40");
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dzRef.current?.classList.add("ring-2", "ring-amber-500/60", "bg-amber-50/40");
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dzRef.current?.classList.remove("ring-2", "ring-amber-500/60", "bg-amber-50/40");
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);

    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("locale", locale);
    // append chosen files
    files.forEach(f => fd.append("attachments", f));

    try {
      const res = await fetch("/api/contact", { method: "POST", body: fd });
      const data: Status = await res.json();
      setStatus(data);
      if (data.ok) {
        form.reset();
        setFiles([]);
      }
    } catch {
      setStatus({ ok: false, message: t("errors.unexpected") });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-gradient-to-b from-white to-slate-0 py-1">
      <div className="w-full px-0 py-4 md:max-w-[clamp(320px,80vw,928px)] md:mx-auto md:px-6 lg:px-8 md:py-6">
        <div className="card-surface shadow-colored p-5 md:p-6 space-y-6">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">{t("hero.title")}</h1>
            <p className="text-slate-600 mt-2">{t("hero.subtitle")}</p>
          </header>
 <section className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 md:px-5 md:py-4 space-y-3">
           <div className="flex items-center gap-2">

             <div>
                <h2 className="text-sm font-semibold tracking-tight md:text-base">
                  {t("company.title")}
               </h2>
              <p className="text-xs text-slate-500 md:text-sm">
                {t("company.subtitle")}
               </p>
              </div>
            </div>

           <dl className="grid gap-3 text-sm md:grid-cols-2 md:text-[0.95rem]">
             <div className="space-y-0.5">
               <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("company.nameLabel")}
               </dt>
              <dd className="font-medium text-slate-900">
                {t("company.name")}
                </dd>
              </div>

              <div className="space-y-0.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                   {t("company.emailLabel")}
              </dt>
              <dd>
               <a
                  href={`mailto:${t("company.email")}`}
                   className="text-slate-900 underline-offset-2 hover:underline"
                  >
                    {t("company.email")}
                  </a>
               </dd>
             </div>

            <div data-nosnippet="true" className="space-y-0.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t("company.phoneLabel")}
                </dt>
                <dd
                  className="select-none flex items-center gap-2"
                  aria-label={t("company.phoneLabel")}
                >
            <Image
  src={telImageSrc}
  alt={t("company.phoneLabel")}
  width={120}
  height={17} // Next.js için zorunlu; gerçek boyut CSS'ten gelecek
  className="w-[120px] h-auto pointer-events-none select-none"
  draggable={false}
/>
<Image
                  src="/tel/WhatsApp.svg"
                  alt="WhatsApp"
                  width={20}
                  height={20}
                  className="w-[30px] h-auto pointer-events-none select-none"
                  draggable={false}
                />
                </dd>
              </div>

            <div className="space-y-0.5 md:col-span-2">
             <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                 {t("company.addressLabel")}
                </dt>
              <dd className="text-slate-900">
                {t("company.address")}
            </dd>
          </div>
        </dl>

        {social && (
        <div className="mt-3 flex items-center gap-3 text-slate-600">
             {social.linkedin && (
               <a
                 href={social.linkedin}
                 target="_blank"
                  rel="noopener noreferrer"
               aria-label="LinkedIn"
                className="inline-flex p-1 rounded-full hover:bg-slate-100"
          >
                <Linkedin className="h-4 w-4" />
              </a>
         )}
             {social.twitter && (
              <a
                 href={social.twitter}
                 target="_blank"
                 rel="noopener noreferrer"
                  aria-label="Twitter"
                   className="inline-flex p-1 rounded-full hover:bg-slate-100"
             >
                 <Twitter className="h-4 w-4" />
            </a>
         )}
          {social.instagram && (
                <a
                 href={social.instagram}
                target="_blank"
                rel="noopener noreferrer"
               aria-label="Instagram"
               className="inline-flex p-1 rounded-full hover:bg-slate-100"
           >
                  <Instagram className="h-4 w-4" />
                </a>
              )}
         </div>
          )}

          </section>
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
            <div className="grid md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">{t("fields.email.label")} <span className="text-amber-600">*</span></span>
                <input name="email" type="email" required placeholder={t("fields.email.placeholder")} className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500" />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">{t("fields.phone.label")}</span>
                <input name="phone" type="tel" placeholder={t("fields.phone.placeholder")} className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500" />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t("fields.subject.label")} <span className="text-amber-600">*</span></span>
              <input name="subject" required placeholder={t("fields.subject.placeholder")} className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t("fields.message.label")} <span className="text-amber-600">*</span></span>
              <textarea name="message" required rows={6} placeholder={t("fields.message.placeholder")} className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500" />
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t("fields.attachments.label")}</span>

              <label
                ref={dzRef}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h10a4 4 0 100-8h-1M7 15l5-5m0 0l5 5m-5-5v12" />
                </svg>
                <div className="text-sm">
                  <span className="font-medium">{t("dropzone.title")}</span>
                  <span className="text-slate-500"> {t("dropzone.or")}</span>
                </div>
                <div className="mt-1">
                  <span className="inline-flex items-center rounded-full bg-amber-600 px-3 py-1 text-xs font-medium text-white shadow-colored">
                    {t("dropzone.browse")}
                  </span>
                </div>
                <input
                  type="file"
                  name="attachments"
                  multiple
                  className="sr-only"
                  onChange={(e) => onFilesSelected(e.currentTarget.files)}
                />
                <p className="mt-2 text-xs text-slate-500">{t("fields.attachments.hint")}</p>
              </label>

              {files.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {files.map((f, idx) => (
                    <li key={idx} className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs shadow-sm">
                      <span className="truncate max-w-[220px]" title={f.name}>{f.name}</span>
                      <button type="button" onClick={() => removeFile(idx)} className="rounded-full p-1 hover:bg-rose-50" aria-label="Remove">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-slate-500 group-hover:text-rose-600" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 8.586l4.95-4.95 1.414 1.415L11.414 10l4.95 4.95-1.414 1.415L10 11.414l-4.95 4.95-1.414-1.415L8.586 10l-4.95-4.95L5.05 3.636 10 8.586z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-full bg-amber-600 text-white font-medium shadow-colored hover:bg-amber-700 disabled:opacity-60"
              >
                {submitting ? t("actions.sending") : t("actions.send")}
              </button>
            </div>
          </form>

          {status && (
            <div className={status.ok ? "rounded-lg bg-emerald-50 border border-emerald-200 p-4" : "rounded-lg bg-rose-50 border border-rose-200 p-4"}>
              <p className="text-sm">{status.message}{status.ref ? ` (${t("ref")}: ${status.ref})` : ""}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
