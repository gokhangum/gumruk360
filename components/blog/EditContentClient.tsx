"use client";

import { useState } from "react";
import RichEditor from "@/components/blog/RichEditor";
import { useTranslations } from "next-intl";
export default function EditContentClient({
  postId,
  initialContent,
  initialTitle,
}: {
  postId: string;
  initialContent: any;
  initialTitle: string;
}) {
  const [content, setContent] = useState<any>(initialContent || { type: "doc", content: [{ type: "paragraph" }] });
  const [title, setTitle] = useState<string>(initialTitle || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
const t = useTranslations("EditContentClient");
  async function handleSave() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/blog/admin/update-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: postId, title, content_json: content }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setMsg(json?.error || t("saveError"));
      } else {
        setMsg(t("saved"));
      }
    } catch (e: any) {
      setMsg(e?.message || t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-3">
        <label className="block text-sm font-medium mb-1">{t("labelTitle")}</label>
        <input
          className="w-full rounded-lg border px-3 py-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
         placeholder={t("placeholderTitle")}
        />
      </div>

      <RichEditor postId={postId} value={content} onChange={setContent} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
        >
          {busy ? t("saving") : t("save")}
        </button>
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
      </div>
    </div>
  );
}
