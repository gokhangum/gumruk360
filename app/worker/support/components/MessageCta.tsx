"use client";
import * as React from "react";
import { extractActionUrls, labelsFor } from "@/components/utils/url";

export default function MessageCta({ body, subject }: { body?: string | null; subject?: string | null }) {
  const { askUrl, subsUrl } = extractActionUrls(body || "");
  if (!askUrl && !subsUrl) return null;
  const labels = labelsFor(subject || "");
  return (
    <div className="shrink-0 flex gap-2">
      {askUrl ? (
        <a
          href={askUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-800 text-white px-3 py-1.5 text-xs"
        >
          {labels.ask}
        </a>
      ) : null}
      {subsUrl ? (
        <a
          href={subsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs"
        >
          {labels.subs}
        </a>
      ) : null}
    </div>
  );
}
