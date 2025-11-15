"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
/**
 * Renders support message body:
 * - Keeps original whitespace
 * - Linkifies http/https URLs
 * - Detects "Soru id: <uuid>" and turns the UUID into a clickable link to /ask/<uuid>
 */
const URL_REGEX = /https?:\/\/[^\s]+/g;
const UUID_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

function linkify(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  text.replace(URL_REGEX, (match, offset) => {
    if (last < offset) nodes.push(text.slice(last, offset));
    const display = match.replace(/[),.;!?]+$/, "");
    nodes.push(
      <a key={offset} href={match} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-700">
        {display}
      </a>
    );
    last = offset + match.length;
    return match;
  });
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function MessageBodySmart({ text }: { text?: string | null }) {
	const te = useTranslations("support.email"); // questionId etiketi için
const questionIdLabel = te("questionId");
// RegExp içinde kullanacağımız için label’ı kaçırıyoruz:
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const QID_REGEX = new RegExp("^\\s*" + esc(questionIdLabel) + ":\\s*([0-9a-fA-F-]{36})\\s*$");

  const content = (text ?? "").split("\n").flatMap((line, i) => {
    // Detect "Soru id: <uuid>"
    const m = line.match(QID_REGEX);
    if (m && m[1] && UUID_REGEX.test(m[1])) {
      const uuid = m[1];
return [
  <div key={"l" + i}>
    {questionIdLabel}:{" "}
    <a href={`/ask/${uuid}`} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-700">
      {uuid}
    </a>
  </div>,
  <br key={"br" + i} />,
];
    }

    // Otherwise linkify http/https URLs in the line
    const parts = linkify(line);
    return [
      <span key={"l" + i}>{parts}</span>,
      <br key={"br" + i} />,
    ];
  });

  return <div className="break-words text-gray-800">{content}</div>;
}
