// components/cv/CvPreviewCard.tsx
"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
type RichNode = {
  id?: string;
  type?: string;
  text?: string;
  marks?: { type: string }[];
  attrs?: Record<string, any>;
  content?: RichNode[];
};

type CvBlock = {
  id?: string;
  block_type: string;
  order_no?: number;
  body_rich?: any; // TipTap JSON
};

export interface CvPreviewCardProps {
  photoUrl: string | null;
  displayName: string | null;
  title?: string | null; // NEW: Ünvan
  hourlyRate: number | string | null;
  languages?: string[] | null;
  tags?: string[] | null; // slugs / expertise
  blocks?: CvBlock[] | null;
  locale?: "tr" | "en" | string;
  showHourlyRate?: boolean;
}

function applyMarks(text: string, marks?: { type: string }[]) {
  if (!marks || !marks.length) return text;
  return marks.reduce((acc, m) => {
    if (m.type === "bold") return <strong>{acc}</strong>;
    if (m.type === "italic") return <em>{acc}</em>;
    if (m.type === "code") return <code>{acc}</code>;
    return acc;
  }, text as any);
}

function renderTextWithNewlines(text: string, keyBase: string, marks?: { type: string }[]) {
  const parts = String(text ?? "").split("\n");
  return parts.map((part, idx) => (
    <React.Fragment key={`${keyBase}-line-${idx}`}>
      {applyMarks(part, marks)}
      {idx < parts.length - 1 ? <br /> : null}
    </React.Fragment>
  ));
}

type RN = RichNode;
function renderInline(node: RN, idxPath: string) {
  if (node.type === "text") {
    if (node.text && node.text.includes("\n")) {
      return (
        <React.Fragment key={node.id ?? `${idxPath}-textnl`}>
          {renderTextWithNewlines(node.text, `${idxPath}-txt`, node.marks)}
        </React.Fragment>
      );
    }
    return <React.Fragment key={node.id ?? `${idxPath}-text`}>{applyMarks(node.text || "", node.marks)}</React.Fragment>;
  }
  if (node.type === "hardBreak") return <br key={node.id ?? `${idxPath}-br`} />;
  if (node.content && Array.isArray(node.content)) {
    return (
      <React.Fragment key={node.id ?? `${idxPath}-${node.type}-inline`}>
        {node.content.map((c, ci) => renderInline(c, `${idxPath}-${ci}`))}
      </React.Fragment>
    );
  }
  return <React.Fragment key={node.id ?? `${idxPath}-empty`} />;
}

function renderBlock(node: RN, idxPath: string): React.ReactNode {
  const key = node.id ?? `${idxPath}-${node.type}`;
  switch (node.type) {
    case "paragraph":
      return (
        <p key={key} className="leading-relaxed text-[15px] whitespace-pre-wrap">
          {node.content?.map((c, ci) => renderInline(c, `${idxPath}-p-${ci}`))}
        </p>
      );
    case "heading": {
      const level = node.attrs?.level ?? 2;
      const Tag = `h${Math.min(6, Math.max(1, level))}` as any;
      return (
        <Tag key={key} className="font-semibold mt-4 mb-2">
          {node.content?.map((c, ci) => renderInline(c, `${idxPath}-h-${ci}`))}
        </Tag>
      );
    }
    case "bulletList":
      return (
        <ul key={key} className="list-disc ml-6 space-y-1">
          {node.content?.map((li, lii) => (
            <li key={li.id ?? `${idxPath}-bul-${lii}`}>
              {li.content?.map((c, ci) => renderInline(c, `${idxPath}-bulitem-${ci}`))}
            </li>
          ))}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} className="list-decimal ml-6 space-y-1">
          {node.content?.map((li, lii) => (
            <li key={li.id ?? `${idxPath}-ord-${lii}`}>
              {li.content?.map((c, ci) => renderInline(c, `${idxPath}-orditem-${ci}`))}
            </li>
          ))}
        </ol>
      );
    case "blockquote":
      return (
        <blockquote key={key} className="border-l-4 pl-3 italic opacity-80">
          {node.content?.map((c, ci) => renderInline(c, `${idxPath}-bq-${ci}`))}
        </blockquote>
      );
    case "horizontalRule":
      return <hr key={key} className="my-3 border-neutral-200" />;
    default: {
      if (node.content && Array.isArray(node.content)) {
        return (
          <div key={key}>
            {node.content.map((c, ci) => renderInline(c, `${idxPath}-x-${ci}`))}
          </div>
        );
      }
      return <div key={key} />;
    }
  }
}

function RichRenderer({ json }: { json: any }) {
  const nodes: RN[] = (json?.content ?? []) as RN[];
  return <div className="space-y-2">{nodes.map((n, i) => renderBlock(n, `root-${i}`))}</div>;
}

export default function CvPreviewCard(props: CvPreviewCardProps) {
  const {
    photoUrl,
    displayName,
    title,
    hourlyRate,
    tags = [],
    blocks = [],
    locale = "tr",
    showHourlyRate = true,
  } = props;
const t = useTranslations("common.cvPreview");
  return (
    <div className="w-full max-w-3xl mx-auto rounded-2xl border border-neutral-200 shadow-sm bg-white overflow-hidden">
      <div className="flex gap-4 p-6 items-center">
        {/* Photo 5x6 cm box */}
        <div
          className="shrink-0 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200"
          style={{ width: "5cm", height: "6cm" }}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={displayName ?? t("profileAlt")} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full grid place-items-center text-neutral-400 text-sm">{t("noPhoto")}</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xl font-semibold truncate">
            {displayName ?? t("unnamedConsultant")}
          </div>

          {/* NEW: Title (ünvan) under the name */}
          {title ? (
            <div className="text-[15px] text-neutral-800 mt-0.5 whitespace-pre-wrap">
              {title}
            </div>
          ) : null}

          {/* Hourly rate (optional, hidden in admin preview) */}
          {showHourlyRate && (
            <div className="text-sm text-neutral-600 mt-1">
              {hourlyRate ? `${hourlyRate} ${t("perHourShort")}` : t("hourlyNotSet")}
            </div>
          )}

          {/* Slugs row */}
          {Array.isArray(tags) && tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-sm font-bold text-neutral-900">
                {t("specificExpertise")}
              </span>
              {tags.map((tag, i) => (
                <span
                  key={`${tag}-${i}`}
                  className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-6 pb-6 space-y-6">
        {Array.isArray(blocks) && blocks.map((blk, i) => (
          <section key={blk.id ?? `${blk.block_type}-${blk.order_no ?? i}-${i}`} className="space-y-2">
            <div className="text-[16px] font-bold text-neutral-900">{blk.block_type}</div>
            {blk.body_rich ? (
              <RichRenderer json={blk.body_rich} />
            ) : (
             <p className="text-neutral-500 text-sm">{t("noContent")}</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
