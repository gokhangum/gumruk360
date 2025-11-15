"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
function bytesToHuman(n: number) {
  if (!n && n !== 0) return "";
  const units = ["B","KB","MB","GB","TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
const MAX_TOTAL = 20 * 1024 * 1024; // 20 MB (next.config ile uyumlu)
function AttachmentIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21.44 11.05 12.5 19.99a6 6 0 1 1-8.49-8.48l10-10a4 4 0 1 1 5.66 5.66l-10 10a2 2 0 1 1-2.83-2.83l9.19-9.19" />
    </svg>
  );
}

export default function AttachmentsPicker({ name = "attachments", inputId = "attachments" }: { name?: string; inputId?: string }) {
	const t = useTranslations("support.ui");
  const tf = useTranslations("support.ui.filePicker");
   const inputRef = React.useRef<HTMLInputElement>(null);
   const setInputFiles = (list: File[]) => {
     if (inputRef.current) {
       const dt = new DataTransfer();
       list.forEach((f) => dt.items.add(f));
       inputRef.current.files = dt.files;
     }
     setFiles(list);
   };
   const removeAt = (index: number) => {
     const next = files.filter((_, i) => i !== index);
     setInputFiles(next);
   };
const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [files, setFiles] = React.useState<File[]>([]);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     const list = Array.from(e.target.files ?? []);
     const total = list.reduce((sum, f) => sum + (f?.size || 0), 0);
    if (total > MAX_TOTAL) {
       setErrorMsg(`Toplam ek boyutu ${bytesToHuman(total)} — limit ${bytesToHuman(MAX_TOTAL)}. Lütfen daha küçük veya daha az dosya seçin.`);
       if (e.target) e.target.value = ""; // input'u sıfırla, form gönderilse bile büyük dosyalar gitmesin
      setInputFiles([]); // dahili listeyi de temizle
      return;
     }
    setErrorMsg(null);
    setInputFiles(list);
  };
  return (
    <div>
      <label className="block text-sm mb-1">{t("attachments")}</label>
      <input id={inputId} type="file" name={name} multiple className="sr-only" onChange={onChange} ref={inputRef} />
      <label
        htmlFor={inputId}
        className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 cursor-pointer select-none"
        title={tf("title")}
      >
        <AttachmentIcon />
        {tf("button")}
      </label>
	  {errorMsg && (
  <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
    {errorMsg}
  </div>
)}
     <p className="text-xs text-gray-500 mt-1">{tf("helper")}</p>

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f, idx) => (
            <li key={idx} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <AttachmentIcon />
                <span className="truncate" title={f.name}>{f.name}</span>
              </span>
              <div className="ml-3 shrink-0 flex items-center gap-2">
                 <span className="text-gray-500 text-xs">{bytesToHuman((f as any).size || 0)}</span>
                 <button
                   type="button"
                   onClick={() => removeAt(idx)}
                   className="px-2 py-0.5 border rounded text-xs hover:bg-gray-50"
                 >Sil</button>
               </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
