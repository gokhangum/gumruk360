// app/admin/tools/bulk-delete-questions/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  title: string | null;
  created_at: string;
  blockers: number;
  attachments: number;
  has_attachments: boolean;
};

type Report = any;

export default function BulkDeleteQuestionsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");

  async function load() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/admin/questions/bulk-delete/list");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Listeleme başarısız.");
      setItems(json.items || []);
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const t = (it.title || "").toLowerCase();
      return it.id.includes(q) || t.includes(q);
    });
  }, [items, filter]);

  const allChecked = filtered.length > 0 && filtered.every((it) => selected[it.id]);
  const toggleAll = () => {
    if (allChecked) {
      // uncheck all in filtered
      setSelected((prev) => {
        const next = { ...prev };
        for (const it of filtered) delete next[it.id];
        return next;
      });
    } else {
      // check all in filtered
      setSelected((prev) => {
        const next = { ...prev };
        for (const it of filtered) next[it.id] = true;
        return next;
      });
    }
  };

  async function run(dryRun: boolean) {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!ids.length) {
      setReport({ ok: false, error: "Seçim yapmadın." });
      return;
    }
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/admin/questions/bulk-delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, dryRun }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "İşlem başarısız");
      setReport(json);
      if (!dryRun && json.ok) {
        await load();
        setSelected({});
      }
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Bulk Delete – Questions (All)</h1>

      <div className="flex flex-wrap items-center gap-3">
        <button className="px-3 py-2 rounded bg-gray-200" onClick={load} disabled={loading}>
          Yenile
        </button>
        <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={() => run(true)} disabled={loading}>
          Önizleme (Dry-Run)
        </button>
        <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={() => run(false)} disabled={loading}>
          Seçileni Sil
        </button>
        {loading && <span>İşlem yapılıyor…</span>}

        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="ID veya başlık ara…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 rounded border w-64"
          />
          <span className="text-sm text-gray-600">Seçili: {selectedCount}</span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="overflow-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              </th>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Başlık</th>
              <th className="p-2 text-left">Ek</th>
              <th className="p-2 text-left">Blokaj</th>
              <th className="p-2 text-left">Tarih</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.id} className="border-t hover:bg-gray-50">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={!!selected[it.id]}
                    onChange={(e) =>
                      setSelected((s) => ({ ...s, [it.id]: e.target.checked }))
                    }
                  />
                </td>
                <td className="p-2 font-mono">{it.id}</td>
                <td className="p-2">{it.title || <em>(başlıksız)</em>}</td>
                <td className="p-2">{it.has_attachments ? `Evet (${it.attachments})` : "Hayır"}</td>
                <td className="p-2">{it.blockers}</td>
                <td className="p-2">{new Date(it.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={6} className="p-4 text-center text-gray-500">Kayıt yok</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {report && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Rapor</h2>
          <pre className="p-3 bg-gray-900 text-gray-100 rounded overflow-auto text-xs">
{JSON.stringify(report, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
