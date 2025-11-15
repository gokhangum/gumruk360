// components/blog/CoverEditor.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
type Props = {
  postId: string;
  initialPath?: string | null;
  onChanged?: (newPath: string | null) => void;
};

export default function CoverEditor({ postId, initialPath, onChanged }: Props) {
	 const t = useTranslations("CoverEditor");
  const [busy, setBusy] = useState(false);
  const [path, setPath] = useState<string | null>(initialPath ?? null);

  async function handleClear() {
    setBusy(true);
    try {
      const res = await fetch("/api/blog/cover/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const js = await res.json();
      if (!res.ok || !js?.ok) throw new Error(js?.error || "clear failed");
      setPath(null);
      onChanged?.(null);
    } catch (e) {
      console.error(e);
      alert(`${t("clearFailed")}: ${(e as any)?.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadDone(objectName: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/blog/cover/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, objectName }),
      });
      const js = await res.json();
      if (!res.ok || !js?.ok) throw new Error(js?.error || "set failed");
      setPath(objectName);
      onChanged?.(objectName);
    } catch (e) {
      console.error(e);
       alert(`${t("setFailed")}: ${(e as any)?.message}`);
    } finally {
      setBusy(false);
    }
  }

  // Not: Upload butonunu sizin mevcut uploader'a bağlayın.
  // Burada sadece sahte bir input var: "objectName" (storage 'blog' içindeki path).
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder={t("inputPlaceholder")}
          className="border rounded px-2 py-1 w-full"
          disabled={busy}
          onKeyDown={async (e) => {
            if (e.key === "Enter") {
              const val = (e.target as HTMLInputElement).value.trim();
              if (val) await handleUploadDone(val);
            }
          }}
        />
        <button
          type="button"
          className="px-3 py-1 rounded bg-gray-100 border"
          disabled={busy || !path}
          onClick={handleClear}
         title={t("btnClearTitle")}
        >
         {t("btnClear")}
        </button>
      </div>
       {path ? (
        <p className="text-sm text-gray-600">{t("currentCoverPrefix")} {path}</p>
       ) : (
        <p className="text-sm text-gray-400">{t("noCover")}</p>
     )}
    </div>
  );
}
