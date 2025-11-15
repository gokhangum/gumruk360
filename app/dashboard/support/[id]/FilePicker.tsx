"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
type Props = {
  name?: string;
  inputId?: string;
  labelText?: string;
  buttonText?: string;
  helperId?: string;
  multiple?: boolean;
};

export default function FilePicker({
	
  name = "attachments",
  inputId,
  labelText = undefined,
  buttonText = undefined,
  helperId,
  multiple = true,
}: Props) {
	const t = useTranslations("support.ui");
  const rid = useId();
  const id = inputId || `file_${rid}`;
  const helpId = helperId || `${id}_helper`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    setFiles(list);
  };

  const clear = () => {
    if (inputRef.current) inputRef.current.value = "";
    setFiles([]);
  };

  return (
    <div>
      <label className="block text-sm mb-1">{labelText ?? t("attachments")}</label>
      <input
        ref={inputRef}
        type="file"
        id={id}
        name={name}
        multiple={multiple}
        className="sr-only"
        onChange={onChange}
      />
      <label
        htmlFor={id}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm hover:bg-gray-50 active:shadow-inner cursor-pointer text-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path d="M16.5 6h-9l-1.5 3H3v9h18V9h-3l-1.5-3zM12 17a3 3 0 110-6 3 3 0 010 6zm0-8l.75-1.5h-1.5L12 9z"/>
        </svg>
        <span>{buttonText ?? t("filePicker.button")}</span>
      </label>

      <div className="mt-2">
        {files.length === 0 ? (
          <div className="text-xs text-gray-500" id={helpId}></div>
        ) : (
          <div className="text-xs">
            <div className="flex items-center justify-between mb-1">
               <span className="text-gray-600">
   {t("filePicker.selectedCount", { count: files.length })}
 </span>
            <button type="button" onClick={clear} className="underline hover:no-underline">
    {t("filePicker.clear")}
  </button>
            </div>
            <ul className="max-h-36 overflow-auto border rounded p-2 space-y-1 bg-white">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="truncate max-w-[260px]">{f.name}</span>
                  <span className="shrink-0 tabular-nums">{Math.ceil(f.size / 1024)} KB</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
