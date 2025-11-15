// components/blog/EditorTextarea.tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
type Props = {
  initial?: any;
  onChange: (json: any) => void;
};

export default function EditorTextarea({ initial, onChange }: Props) {
	const t = useTranslations("EditorTextarea");
  const [raw, setRaw] = useState<string>(
    initial ? JSON.stringify(initial, null, 2) : ""
  );

  // Convert plain text into a minimal Tiptap-like JSON if user types non-JSON
  useEffect(() => {
    try {
      const parsed = raw.trim() ? JSON.parse(raw) : null;
      onChange(parsed ?? { type: "doc", content: [] });
    } catch {
      onChange({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: raw }] },
        ],
      });
    }
  }, [raw, onChange]);

  return (
    <textarea
      className="w-full min-h-60 rounded-xl border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      placeholder={t("placeholder")}
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
    />
  );
}
