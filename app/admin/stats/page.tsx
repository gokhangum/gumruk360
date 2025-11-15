// app/admin/stats/page.tsx
export const dynamic = "force-dynamic";

import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "../../../lib/supabase/server";

type ProfilesStats = {
  total: number | null;
  user: number | null;
  worker: number | null;
  admin: number | null;
  new7d: number | null;
};
type QuestionsStats = {
  total: number;
  rejected: number;
  sentOnly: number;
  approved: number;
};
type PaymentsStats = {
  totalAmount: number | null;
};
type WorkerItem = { id: string; name: string; assigned: number; completed: number; earned: number };
type WorkersStats = {
  byWorker: WorkerItem[];
  summary: { assigned: number; completed: number; earned: number };
};
type StatsDTO = {
  profiles: ProfilesStats;
  questions: QuestionsStats;
  payments: PaymentsStats;
  workers: WorkersStats;
  since7d: string;
};

function Card({ title, value, sub }: { title: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="border rounded-xl p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value ?? "—"}</div>
      {sub ? <div className="text-xs text-gray-400 mt-1">{sub}</div> : null}
    </div>
  );
}

function fmtMoney(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${(typeof n === "number" && Number.isFinite(n)) ? n.toFixed(2) : n}`;
  }
}

function buildBaseUrl(h: Headers) {
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

async function getStats(): Promise<{ ok: boolean; data?: StatsDTO; error?: string }> {
  // Next 15: headers() MUST be awaited before .get()
  const hdrs = await headers();
  const cookieHeader = hdrs.get("cookie") ?? "";
  const base = buildBaseUrl(hdrs);

  const res = await fetch(`${base}/api/admin/stats`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });

  try {
    const json = (await res.json()) as any;
    return json;
  } catch {
    return { ok: false, error: `invalid_response (${res.status})` };
  }
}

export default async function AdminStatsPage() {
  const supabase = await supabaseServer();
  const { data: me } = await supabase.auth.getUser();
  if (!me?.user) redirect("/admin/login?next=/admin/stats");

  const { ok, data, error } = await getStats();

  if (!ok || !data) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-3">İstatistikler</h1>
        <div className="text-red-600">İstatistikler alınamadı: {error || "unknown_error"}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">İstatistikler</h1>

      {/* Kullanıcılar */}
      <section>
        <h2 className="text-sm font-medium text-gray-600 mb-2">Kullanıcılar</h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Card title="Toplam" value={data.profiles.total} />
          <Card title="User" value={data.profiles.user} />
          <Card title="Worker" value={data.profiles.worker} />
          <Card title="Admin" value={data.profiles.admin} />
        </div>
        <div className="mt-3">
          <Card
            title="Son 7 günde yeni kayıt"
            value={data.profiles.new7d}
            sub={`>= ${new Date(data.since7d).toLocaleDateString()}`}
          />
        </div>
      </section>

      {/* Sorular */}
      <section>
        <h2 className="text-sm font-medium text-gray-600 mb-2 mt-6">Sorular</h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Card title="Toplam Soru" value={data.questions.total} />
          <Card title="Reddedilen" value={data.questions.rejected} />
          <Card title="Yalnızca Gönderildi (işlem yok)" value={data.questions.sentOnly} />
          <Card title="Onaylanan" value={data.questions.approved} />
        </div>
      </section>

      {/* Ödemeler */}
      <section>
        <h2 className="text-sm font-medium text-gray-600 mb-2 mt-6">Ödemeler</h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Card title="Toplam Ödeme Tutarı" value={fmtMoney(data.payments.totalAmount)} />
        </div>
      </section>

      {/* Worker bazında özet */}
      <section>
        <h2 className="text-sm font-medium text-gray-600 mb-2 mt-6">Worker Bazında</h2>
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="p-2 border-b w-[40%]">Worker</th>
                <th className="p-2 border-b w-[20%]">Atanan</th>
                <th className="p-2 border-b w-[20%]">Tamamlanan</th>
                <th className="p-2 border-b w-[20%]">Kazanılan</th>
              </tr>
            </thead>
            <tbody>
              {data.workers.byWorker.length === 0 && (
                <tr>
                  <td className="p-3 text-gray-500" colSpan={4}>Kayıt bulunamadı.</td>
                </tr>
              )}
              {data.workers.byWorker.map(w => (
                <tr key={w.id} className="border-b">
                  <td className="p-2">{w.name}</td>
                  <td className="p-2">{w.assigned}</td>
                  <td className="p-2">{w.completed}</td>
                  <td className="p-2">{fmtMoney(w.earned)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-medium">
                <td className="p-2">Toplam</td>
                <td className="p-2">{data.workers.summary.assigned}</td>
                <td className="p-2">{data.workers.summary.completed}</td>
                <td className="p-2">{fmtMoney(data.workers.summary.earned)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          * “Kazanılan” kalemi, worker’ın tamamladığı sorulara ait <strong>paid</strong> order toplamıdır.
        </p>
      </section>
    </div>
  );
}
