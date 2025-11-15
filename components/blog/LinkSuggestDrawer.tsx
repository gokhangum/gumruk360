"use client";
import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
/** Basit stopwords (TR+EN karışık mini set) */
const STOP = new Set([
  "ve","veya","ile","bir","birkaç","çok","az","için","gibi","olan","olanlar","olanları",
  "de","da","ki","bu","şu","o","the","a","an","of","to","in","on","for","with","at","by",
]);

type SuggestItem = { slug: string; title: string; score: number };
type ItemsByQuery = Record<string, SuggestItem[]>;

type Props = {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
  lang?: string | null; // "tr"|"en"
  baseUrl: string;       // window.location.origin
};

/** Metinden aday tekil kelime + bigram çıkar (ilk MVP). */
function extractCandidates(text: string, max = 18) {
  const tokens = text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(t => t.replace(/[.,;:!?()"'`]/g, "").toLowerCase())
    .filter(Boolean)
    .filter(t => !STOP.has(t) && t.length >= 3);

  const counts: Record<string, number> = {};
  tokens.forEach(t => { counts[t] = (counts[t] || 0) + 1; });

  const unigrams = Object.entries(counts)
    .sort((a,b)=>b[1]-a[1])
    .slice(0, Math.ceil(max * 0.6))
    .map(([w]) => w);

  const bigrams: Record<string, number> = {};
  for (let i=0;i<tokens.length-1;i++){
    const bg = `${tokens[i]} ${tokens[i+1]}`;
    if (bg.split(" ").some(w => STOP.has(w))) continue;
    bigrams[bg] = (bigrams[bg]||0)+1;
  }
  const bigramList = Object.entries(bigrams)
    .sort((a,b)=>b[1]-a[1])
    .slice(0, Math.ceil(max * 0.4))
    .map(([w]) => w);

  const out = Array.from(new Set([...bigramList, ...unigrams])).slice(0, max);
  return out;
}

/** Dokümanda verilen phrase'in tüm aralıklarını bul (linkli alanları atla). */
function findRanges(editor: Editor, phrase: string) {
  const { state } = editor;
  const docText = state.doc.textBetween(0, state.doc.content.size, " ", " ");
  const ranges: Array<{ from: number; to: number }> = [];

  // Basit arama: case-insensitive, kelime sınırı toleranslı (MVP)
  const pattern = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(docText))) {
    const fromTextOffset = match.index;
    const toTextOffset = match.index + match[0].length;

    // textOffset → doc position map (yaklaşık, TipTap basit parça için yeterli)
    const from = mapTextOffsetToDocPos(editor, fromTextOffset);
    const to = mapTextOffsetToDocPos(editor, toTextOffset);

    if (from < to && !isRangeInsideLink(editor, from, to)) {
      ranges.push({ from, to });
    }
  }
  return ranges;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Text offset'i kabaca doc pos'a çevirme (ProseMirror basit yaklaşım) */
function mapTextOffsetToDocPos(editor: Editor, textOffset: number) {
  const { state } = editor;
  let seen = 0;
  let pos = 0;
  state.doc.descendants((node, position) => {
    if (!node.isText) return true;
    const chunk = node.text ?? "";
    const next = seen + chunk.length;
    if (textOffset <= next) {
      pos = position + 1 + (textOffset - seen);
      return false;
    }
    seen = next;
    return true;
  });
  return pos || state.selection.from;
}

/** Aralık link içinde mi? */
function isRangeInsideLink(editor: Editor, from: number, to: number) {
  const { state } = editor;
  let inside = false;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.marks?.some(m => m.type.name === "link")) {
      inside = true;
      return false;
    }
    return true;
  });
  return inside;
}

export default function LinkSuggestDrawer({ editor, isOpen, onClose, lang, baseUrl }: Props) {
  const [loading, setLoading] = useState(false);
  const [cands, setCands] = useState<string[]>([]);
  const [itemsByQuery, setItemsByQuery] = useState<ItemsByQuery>({});
  const [picked, setPicked] = useState<Record<string, string>>({}); // phrase -> href
const t = useTranslations("LinkSuggestDrawer");
  useEffect(() => {
    if (!isOpen || !editor) return;
    // 1) Metni al, adayları çıkar
    const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, " ", " ");
    const list = extractCandidates(text, 18);
    setCands(list);
    setPicked({});
    setItemsByQuery({});
    // 2) Önerileri toplu çek
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/blog/link-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries: list, lang: lang || undefined, limit: 5 }),
        });
        const json = await res.json();
        setItemsByQuery(json.itemsByQuery || {});
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, editor, lang]);

  const applyAll = () => {
    if (!editor) return;
    const { chain, state, schema } = editor;

    let tr = state.tr;
    // Her phrase için seçilen href’i uygula
    for (const phrase of Object.keys(picked)) {
      const href = picked[phrase];
      if (!href) continue;
      const ranges = findRanges(editor, phrase);
      for (const r of ranges) {
        tr = tr.addMark(r.from, r.to, schema.marks.link.create({ href }));
      }
    }
    if (tr.docChanged || tr.storedMarksSet) {
      editor.view.dispatch(tr);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/30">
      <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-white shadow-xl p-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t("heading")}</h3>
         <button onClick={onClose} className="rounded-md border px-3 py-1 text-sm">{t("close")}</button>
        </div>

     <div className="mt-3 text-sm text-gray-600">{t("intro")}</div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sol: Adaylar */}
          <div>
           <div className="text-sm font-medium mb-2">{t("candidates")}</div>
            <div className="space-y-1">
              {cands.map((q) => (
                <div key={q} className="rounded-md border p-2">
                  <div className="text-sm font-medium">{q}</div>
                  <div className="mt-2 space-y-1">
                {(itemsByQuery[q] || []).length === 0 && (
                     <div className="text-xs text-gray-500">{loading ? t("loading") : t("noSuggestions")}</div>
                    )}
                    {(itemsByQuery[q] || []).map((it) => {
                      const href = `${baseUrl}/blog/${it.slug}`;
                      const active = picked[q] === href;
                      return (
                        <button
                          key={it.slug}
                          onClick={() => setPicked(p => ({ ...p, [q]: href }))}
                          className={`w-full text-left rounded border px-2 py-1 text-sm ${active ? "bg-blue-50 border-blue-300" : "hover:bg-gray-50"}`}
                          title={href}
                        >
                          {it.title}
                          <div className="text-[11px] text-gray-500">{href}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sağ: Seçimler */}
          <div>
           <div className="text-sm font-medium mb-2">{t("selections")}</div>
            <div className="rounded-md border p-2 min-h-24">
              {Object.keys(picked).length === 0 ? (
                <div className="text-sm text-gray-500">{t("noPicks")}</div>
              ) : (
                <div className="space-y-1">
                  {Object.entries(picked).map(([phrase, href]) => (
                    <div key={phrase} className="flex items-start justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-medium">{phrase}</span>
                        <div className="text-[11px] text-gray-500 break-all">{href}</div>
                      </div>
                      <button
                        className="text-xs rounded border px-2 py-1"
                        onClick={() => setPicked(p => { const n = { ...p }; delete n[phrase]; return n; })}
                      >
                       {t("remove")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button className="rounded-md border px-3 py-1 text-sm" onClick={onClose}>{t("cancel")}</button>
              <button
                className="rounded-md bg-blue-600 text-white px-3 py-1 text-sm disabled:opacity-50"
                onClick={applyAll}
                disabled={Object.keys(picked).length === 0}
                  title={t("applyTitle")}
              >
                {t("apply")}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
