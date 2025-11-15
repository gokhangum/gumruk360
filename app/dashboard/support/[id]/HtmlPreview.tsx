"use client";

import React from "react";
import { useTranslations } from "next-intl";
export default function HtmlPreview({ url, height = 320, title }: { url: string; height?: number; title?: string }) {
	const t = useTranslations("common.preview");
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let revoked = false;
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const txt = await res.text();
        const b = new Blob([txt], { type: "text/html;charset=utf-8" });
        const u = URL.createObjectURL(b);
        if (!revoked) setBlobUrl(u);
      } catch (e: any) {
        setError(e?.message || "preview_failed");
      }
    })();
    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url]);

  if (error) {
    return (
      <div className="rounded border p-2 text-xs text-red-600">
        {t("failed", { title: title || "HTML" })}{" "}
        <a className="underline" href={url} target="_blank" rel="noopener noreferrer">
          {t("openFile")}
        </a>
      </div>
    );
  }

  return (
    <div className="w-full border rounded overflow-hidden">
      <iframe
        src={blobUrl || "about:blank"}
        title={title || t("titleHtml")}
        className="w-full"
        style={{ height }}
        sandbox="allow-popups allow-forms allow-pointer-lock allow-same-origin allow-scripts"
      />
    </div>
  );
}
