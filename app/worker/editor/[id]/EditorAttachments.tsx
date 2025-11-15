'use client';

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
type Props = { questionId: string };

type Item = {
  name: string;
  display_name?: string | null;
  path: string;
  url: string | null;
  size: number | null;
  created_at?: string | null;
};

function toDisplayName(name: string, display?: string | null) {
  if (display && display.trim()) return display.trim();
  return name || '—';
}

export default function EditorAttachments({ questionId }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
const t = useTranslations("worker.editor.editorAttachments");
  

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        // ÖNEMLİ: sadece ORİJİNAL SORU EKLERİ
        const r = await fetch(`/api/worker/questions/${questionId}/attachments?scope=question`, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (r.ok && j?.ok) {
          setItems(Array.isArray(j.data) ? j.data : []);
          setErr(null);
        } else {
          setItems([]);
          setErr(j?.display || t("loadFailed"));
        }
      } catch (e: any) {
        if (!alive) return;
        setItems([]);
        setErr(e?.message || t("loadFailed"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [questionId, t]);

  return (
    <div className="card-surface p-3 space-y-3">
      {loading && <div className="text-sm text-gray-600">{t("loading")}</div>}
      {err && <div className="text-sm text-red-600">{err}</div>}

      {!loading && !err && items.length === 0 && (
        <div className="text-sm text-gray-600">{t("empty")}</div>
      )}

      {!loading && !err && items.length > 0 && (
        <ul className="divide-y">
          {items.map((it) => {
            const pretty = toDisplayName(it.name, it.display_name || undefined);
            return (
              <li key={`${it.path}-${pretty}`} className="p-3 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <div className="text-sm truncate">{pretty}</div>
                  {it.url ? (
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline hover:opacity-80"
                    >
                      {t("previewDownload")}
                    </a>
                  ) : (
                    <div className="text-xs text-gray-600">
                      {t("linkCreateFailed")}
                    </div>
                  )}
                </div>
                {typeof it.size === "number" ? (
                  <div className="text-xs text-gray-600 shrink-0">
                    {(it.size / 1024).toFixed(1)} {t("kb")}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
