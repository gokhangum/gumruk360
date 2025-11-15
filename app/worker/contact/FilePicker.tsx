"use client";
import React, { useRef, useState } from "react";
import { useTranslations } from "next-intl";
export default function FilePicker() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
const tPick = useTranslations("questions.filePicker"); // choose / selected / clear

const tAsk = useTranslations("ask.page.files"); // selectedList

const tAtt = useTranslations("worker.editor.editorAttachments"); // kb
  const onClick = () => inputRef.current?.click();
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = Array.from(e.target.files || []);
    setFiles(f);
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        name="attachments"
        multiple
        className="hidden"
        onChange={onChange}
      />
      <button
        type="button"
        onClick={onClick}
        className="px-3 py-2 rounded border bg-white hover:bg-gray-50"
      >
        {tPick("choose")}
      </button>
      {files.length > 0 && (
        <div className="border rounded p-2">
          <div className="text-sm font-medium mb-1">{tAsk("selectedList")}</div>
          <ul className="list-disc pl-5 text-sm space-y-0.5">
            {files.map((f, i) => (
              <li key={i}>
               {f.name} <span className="text-gray-500">({Math.ceil(f.size/1024)} {tAtt("kb")})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
