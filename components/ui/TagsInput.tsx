"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
export type TagsInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  maxTags?: number;
  maxLen?: number;
  placeholder?: string;
};

function normalize(tag: string) {
  return tag.trim();
}

export default function TagsInput({ value, onChange, maxTags = 10, maxLen = 40, placeholder }: TagsInputProps) {
	const t = useTranslations("common.tagsInput");
const ph = placeholder ?? t("placeholder");
  const [input, setInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setErr(null); }, [value, input]);

  function addTag(raw: string) {
    setErr(null);
      const norm = normalize(raw);
   if (!norm) return;
     if (norm.length > maxLen) { setErr(t("tooLong", { max: maxLen })); return; }
   const exists = value.some(v => v.toLocaleLowerCase("tr-TR") === norm.toLocaleLowerCase("tr-TR"));
    if (exists) { setErr(t("alreadyExists")); return; }
    if (value.length >= maxTags) { setErr(t("tooMany", { max: maxTags })); return; }
    onChange([ ...value, norm ]);
    setInput("");
  }

  function removeTag(idx: number) {
    const next = value.slice();
    next.splice(idx, 1);
    onChange(next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
      return;
    }
    if (e.key === "Backspace" && !input && value.length > 0) {
      e.preventDefault();
      removeTag(value.length - 1);
      return;
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    // Split by comma or newline WITHOUT regex to avoid parser issues.
    const lines = text.replace("\r\n", "\n").split("\n");
    let parts: string[] = [];
    for (const ln of lines) {
      parts = parts.concat(ln.split(","));
    }
    const cleaned = parts.map(s => s.trim()).filter(Boolean);
    if (cleaned.length <= 1) return;
    e.preventDefault();
    let current = [...value];
    for (const p of cleaned) {
      if (current.length >= maxTags) break;
      if (!p) continue;
      if (p.length > maxLen) continue;
      const exists = current.some(v => v.toLocaleLowerCase("tr-TR") === p.toLocaleLowerCase("tr-TR"));
      if (!exists) current.push(p);
    }
    onChange(current);
    setInput("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-2 px-2 py-1 rounded-xl border bg-white shadow-sm text-sm">
            {t}
            <button type="button" onClick={()=>removeTag(i)} className="text-gray-500 hover:text-black">×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="min-w-[160px] flex-1 border rounded p-2"
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={ph}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{value.length}/{maxTags}</span>
        {err && <span className="text-red-600">{err}</span>}
      </div>
    </div>
  );
}
