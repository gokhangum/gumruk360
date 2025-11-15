// components/utils/linkify.tsx
"use client";

import * as React from "react";

const URL_REGEX = /https?:\/\/[^\s]+/g;

type LinkifiedTextProps = {
  text: string;
};

/**
 * Basit linkify:
 * - metin içindeki http/https URL'leri tespit eder
 * - URL parçalarını <a> ile sarar
 * - diğer her şeyi düz metin olarak bırakır
 */
export function LinkifiedText({ text }: LinkifiedTextProps) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const url = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    nodes.push(
      <a
        key={`url-${index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline break-words"
      >
        {url}
      </a>
    );

    lastIndex = index + url.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <>{nodes}</>;
}
