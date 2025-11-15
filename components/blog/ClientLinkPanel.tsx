"use client";

import React, { useState } from "react";
import LinkSuggester from "@/components/blog/LinkSuggester";
import { useTranslations } from "next-intl";
export default function ClientLinkPanel({
  baseUrl,
  onPick,
}: {
  baseUrl: string;
  onPick?: (url: string, label?: string) => void;
}) {
  const [q, setQ] = useState("");
const t = useTranslations("ClientLinkPanel");
  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="text-sm font-medium mb-2">{t("heading")}</div>
      <input
        className="input input-bordered w-full rounded-lg border p-2 text-sm mb-2"
        placeholder={t("placeholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <LinkSuggester
        query={q}
        baseUrl={baseUrl}
               onPick={(slug: string, title?: string) => {
          const url = `${baseUrl}/blog/${slug}`;
          if (onPick) onPick(url, title);
          else navigator.clipboard.writeText(url); // fallback: panoya kopyala
        }}
      />
      {onPick ? (
        <div className="text-xs text-gray-500 mt-1">
          {t("hintLinkInEditor")}
        </div>
      ) : (
        <div className="text-xs text-gray-500 mt-1">
          {t("hintCopyToClipboard")}
        </div>
      )}
    </section>
  );
}
