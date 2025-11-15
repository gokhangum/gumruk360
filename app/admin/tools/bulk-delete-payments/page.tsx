// app/admin/tools/bulk-delete-payments/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  created_at: string;
  order_id: string | null;
  question_id: string | null;
  order_ref_count: number;
};

type Report = {
  ok: boolean;
  requested: number;
  deletable_count?: number;
  deleted_count?: number;
  blockers?: Record<string, { reason: string }[]>;
  missing?: string[];
  error?: string;
};

export default function BulkDeletePaymentsPage() {
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
      const res = await fetch("/api/admin/payments/bulk-delete/list");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Listeleme başarısız.");
      setItems(Array.isArray(json.items) ? json.items : []);
      setSelected({});
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
      return (
        it.id.toLowerCase().includes(q) ||
        (it.order_id || "").toLowerCase().includes(q) ||
        (it.question_id || "").toLowerCase().includes(q)
      );
    });
  }, [items, filter]);

  const allChecked = filtered.length > 0 && filtered.every((it) => selected[it.id]);
  const toggleAll = () => {
    if (allChecked) {
      setSelected((prev) => {
        const next = { ...prev };
        for (const it of filtered) delete next[it.id];
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = { ...prev };
        for (const it of filtered) next[it.id] = true;
        return next;
      });
    }
  };

  const selectedIds = Object.entries(selected).filter(([_, v]) => !!v).map(([id]) => id);
  const selectedCount = selectedIds.length;

  async function run(dry: boolean) {
    if (!selectedIds.length) {
      setReport({ ok: false, requested: 0, error: "Ödeme seçmedin." });
      return;
    }
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/admin/payments/bulk-delete/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payment_ids: selectedIds, dry }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "İşlem başarısız");
      setReport(json);
      if (!dry) await load();
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Bulk Delete – Payments</h1>
      <p className="text-sm text-gray-600">
        Tüm payments listelenir. <code>order_id</code> veya <code>question_id</code> doluysa, silme engellenir.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button className="px-3 py-2 rounded bg-gray-200" onClick={load} disabled={loading}>
          Yenile
        </button>
        <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={() => run(true)} disabled={loading || !selectedCount}>
          Önizleme (Silinebilirlik Testi)
        </button>
        <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={() => run(false)} disabled={loading || !selectedCount}>
          Seçileni Kalıcı Sil
        </button>
        {loading && <span>İşlem yapılıyor…</span>}

        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="Payment/Order/Question ID ara…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 rounded border w-80"
          />
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded bg-red-50 text-red-700 border border-red-200">{error}</div>
      )}

      <div className="border rounded overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2"><input type="checkbox" onChange={toggleAll} checked={allChecked} /></th>
              <th className="px-3 py-2 text-left">Payment ID</th>
              <th className="px-3 py-2 text-left">Order ID</th>
              <th className="px-3 py-2 text-left">Question ID</th>
              <th className="px-3 py-2 text-left">Bağlılık</th>
              <th className="px-3 py-2 text-left">Oluşturma</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-gray-500">Kayıt yok.</td>
              </tr>
            )}
            {filtered.map((it) => {
              const refBadge = it.order_ref_count > 0 ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                  Bağlı
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                  Serbest
                </span>
              );
              return (
                <tr key={it.id} className="border-t">
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={!!selected[it.id]}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [it.id]: e.target.checked }))}
                    />
                  </td>
                  <td className="px-3 py-2 align-top font-mono">{it.id}</td>
                  <td className="px-3 py-2 align-top font-mono">{it.order_id || "-"}</td>
                  <td className="px-3 py-2 align-top font-mono">{it.question_id || "-"}</td>
                  <td className="px-3 py-2 align-top">{it.order_ref_count > 0 ? "Bağlı" : "Serbest"}</td>
                  <td className="px-3 py-2 align-top">{new Date(it.created_at).toLocaleString("tr-TR")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-gray-600">
        Seçili: <strong>{selectedCount}</strong>
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
