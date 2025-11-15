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
  if (display && display.trim()) return display;
  // Admin tarafındaki pattern’e uyumlu: 1700000000_abcd1234_filename.ext → filename.ext
  const m = name.match(/^\d+_[a-z0-9]+_(.+)$/i);
  return m ? m[1] : name;
}

export default function WorkerAttachments({ questionId }: Props) {
	const t = useTranslations("worker.questions.ui.workerAttachments");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

 

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/worker/questions/${questionId}/attachments`, { cache: "no-store" });
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
    return () => { alive = false; }
  }, [questionId, t]);

  return (
    <section className="border rounded p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t("title")}</h3>
    {loading && <div className="text-sm text-gray-500">{t("loading")}</div>}
      </div>

      {loading ? <div className="text-sm text-gray-500">{t("loading")}</div> : null}
      {err ? <div className="text-sm text-red-600">{err}</div> : null}

      {!loading && !err && items.length === 0 ? (
        <div className="text-sm text-gray-500">{t("empty")}</div>
      ) : null}

      {!loading && !err && items.length > 0 ? (
        <ul className="divide-y">
          {items.map((it) => {
            const pretty = toDisplayName(it.name, it.display_name || undefined);
            return (
              <li key={`${it.path}-${pretty}`} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm truncate">{pretty}</div>
                  {it.url ? (
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline"
                    >
                      {t("previewDownload")}
                    </a>
                  ) : (
                    <div className="text-xs text-gray-500">{t("linkCreateFailed")}</div>
                  )}
                </div>
                {typeof it.size === "number" ? (
                  <div className="text-xs text-gray-500 shrink-0">
                    {(it.size / 1024).toFixed(1)} {t("kb")}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
