"use client";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
type Suggest = { title: string; slug: string };

export default function LinkSuggester({
  query,
  baseUrl,
  onPick,
}: {
  query: string;
  baseUrl: string;
  onPick: (slug: string) => void;
}) {
  const [items, setItems] = useState<Suggest[]>([]);
  const [loading, setLoading] = useState(false);
const t = useTranslations("LinkSuggester");
  const q = query.trim();
  const canSearch = q.length >= 3;

  useEffect(() => {
    let alive = true;
    async function run() {
      if (!canSearch) { setItems([]); return; }
      setLoading(true);
      try {
        const r = await fetch(`${baseUrl}/blog/data?q=${encodeURIComponent(q)}&limit=8`, { cache: "no-store" });
        const j = await r.json();
        const arr = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
        const mapped = arr.filter((x: any) => x?.slug && x?.title)
          .map((x: any) => ({ title: x.title, slug: x.slug }));
        if (alive) setItems(mapped);
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => { alive = false; };
  }, [q, baseUrl, canSearch]);

  const visible = useMemo(() => canSearch && (loading || items.length > 0), [canSearch, loading, items]);

  if (!visible) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-3 mt-2 max-w-xl">
     <div className="text-sm font-medium mb-2">{t("heading")}</div>
      {loading && <div className="text-sm text-gray-500">{t("loading")}</div>}
      {!loading && (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.slug}>
              <button
                type="button"
                className="text-left w-full hover:bg-gray-50 rounded-md px-2 py-1"
                onClick={() => onPick(it.slug)}
              >
                <span className="text-sm">{it.title}</span>
                <span className="text-xs text-gray-500 ml-2">/blog/{it.slug}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
