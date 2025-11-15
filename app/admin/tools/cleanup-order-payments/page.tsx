// app/admin/tools/cleanup-order-payments/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  order_id: string;
  created_at: string;
  payments: string[] | null;     // payment IDs or null
  question_id: string | null;    // orders.question_id verified in questions else null
  orphan_payment_ids: string[];  // payments with question_id IS NULL
};

export default function CleanupOrderPaymentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);
  const [filter, setFilter] = useState<string>("");
  const [selectedOrders, setSelectedOrders] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`/api/admin/cleanup/order-payment/list`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Listeleme hatası");
      setRows(json.items || []);
      setSelectedOrders({});
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const inOrder = (r.order_id || "").toLowerCase().includes(q);
      const inPayments = (r.payments || []).some((id) => (id || "").toLowerCase().includes(q));
      const inQuestion = (r.question_id || "").toLowerCase().includes(q);
      return inOrder || inPayments || inQuestion;
    });
  }, [rows, filter]);

  const toggleAllOrders = () => {
    const visibleOrderIds = filtered.map((r) => r.order_id);
    const allChecked = visibleOrderIds.length > 0 && visibleOrderIds.every((id) => selectedOrders[id]);
    if (allChecked) {
      const next: Record<string, boolean> = { ...selectedOrders };
      for (const id of visibleOrderIds) delete next[id];
      setSelectedOrders(next);
    } else {
      const next: Record<string, boolean> = { ...selectedOrders };
      for (const id of visibleOrderIds) next[id] = true;
      setSelectedOrders(next);
    }
  };

  async function deleteOrders(ids: string[]) {
    if (!ids.length) {
      setReport({ ok: false, error: "Order seçmedin." });
      return;
    }
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/admin/cleanup/order-payment/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ delete_orders: ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Silme başarısız");
      setReport(json);
      await load();
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteOrphanPaymentsFor(orderId: string) {
    const row = rows.find((r) => r.order_id === orderId);
    const orphanIds = row?.orphan_payment_ids || [];
    if (!orphanIds.length) {
      setReport({ ok: false, error: "Bu order'da öksüz (question_id=null) payment yok." });
      return;
    }
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/admin/cleanup/order-payment/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ delete_payments: orphanIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Silme başarısız");
      setReport(json);
      await load();
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  const selectedOrderIds = Object.keys(selectedOrders).filter((k) => selectedOrders[k]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Orders – Payments – Question (Orders.question_id bazlı)</h1>
      <p className="text-sm text-gray-600">
        Payments sütunu: order_id eşleşen payment ID’leri (yoksa <code>NULL</code>) •
        Soru ID sütunu: <code>orders.question_id</code> questions’da varsa ID, yoksa <code>NULL</code>.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button className="px-3 py-2 rounded bg-gray-200" onClick={load} disabled={loading}>Yenile</button>
        <button
          className="px-3 py-2 rounded bg-red-600 text-white"
          onClick={() => deleteOrders(selectedOrderIds)}
          disabled={loading || selectedOrderIds.length === 0}
          title="Seçili order’ları siler (payments CASCADE silinir)"
        >
          Seçili Order’ları Sil (CASCADE)
        </button>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="Order/Payment/Question ID ara…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 rounded border w-80"
          />
        </div>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-50 text-red-700 border border-red-200">{error}</div>
      )}

      <div className="overflow-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2">
                <button className="px-2 py-1 text-xs rounded border" onClick={toggleAllOrders}>
                  Görünür Order’ları Seç/Kaldır
                </button>
              </th>
              <th className="p-2 text-left">Order ID</th>
              <th className="p-2 text-left">Payments</th>
              <th className="p-2 text-left">Soru ID</th>
              <th className="p-2 text-left">Tarih</th>
              <th className="p-2 text-left">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.order_id} className="border-t hover:bg-gray-50">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={!!selectedOrders[r.order_id]}
                    onChange={(e) => setSelectedOrders((s) => ({ ...s, [r.order_id]: e.target.checked }))}
                  />
                </td>
                <td className="p-2 font-mono">{r.order_id}</td>
                <td className="p-2 font-mono">{r.payments ? r.payments.join(", ") : "NULL"}</td>
                <td className="p-2 font-mono">{r.question_id || "NULL"}</td>
                <td className="p-2">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-2 space-x-2">
                  <button
                    className="px-2 py-1 rounded bg-red-600 text-white"
                    onClick={() => deleteOrders([r.order_id])}
                    title="Order’ı siler (payments CASCADE silinir)"
                  >
                    Order Sil
                  </button>
                  <button
                    className="px-2 py-1 rounded bg-orange-600 text-white"
                    onClick={() => deleteOrphanPaymentsFor(r.order_id)}
                    title="Bu order’daki question_id=NULL ödemeleri siler"
                    disabled={!(rows.find(x => x.order_id === r.order_id)?.orphan_payment_ids.length)}
                  >
                    Öksüz Payment’ları Sil
                  </button>
                </td>
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
