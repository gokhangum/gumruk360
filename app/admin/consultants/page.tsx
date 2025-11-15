"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type TypeRow = {
  id?: string;
  key: string;
  title_tr: string;
  title_en: string;
  is_active: boolean;
  order_no: number;
};

type WorkerRow = {
  profile_id: string;
  email: string | null;
  role: string | null;
  cv?: {
    id: string;
    status: string;
    display_name: string | null;
    hourly_rate_tl: number | null;
    hourly_rate_currency: string | null;
    languages: string[] | null;
    tags: string[] | null;
    updated_at: string | null;
  } | null;
};

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "-";
  try { return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n); }
  catch { return String(n); }
}
function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString("tr-TR"); } catch { return String(iso); }
}

async function fetchJSON(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  return r.json();
}

export default function AdminConsultantsTabsPage() {
  const [tab, setTab] = useState<"list"|"types">("list");
  const [rows, setRows] = useState<WorkerRow[]>([]);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [newType, setNewType] = useState<TypeRow>({
    key: "summary",
    title_tr: "Özet",
    title_en: "Summary",
    is_active: true,
    order_no: 0
  });
  const [msg, setMsg] = useState<string | null>(null);

  async function loadList() {
    const j = await fetchJSON("/api/admin/consultants/list"); // helper endpoint (we will add below)
    if (j.ok) setRows(j.data || []);
  }
  async function loadTypes() {
    const j = await fetchJSON("/api/admin/cv-block-types");
    if (j.ok) setTypes(j.data || []);
  }

  useEffect(() => { loadList(); loadTypes(); }, []);

  async function addType() {
    setMsg(null);
    const j = await fetchJSON("/api/admin/cv-block-types", { method: "POST", body: JSON.stringify(newType) });
    if (!j.ok) setMsg(j.error || "Kayıt yapılamadı");
    else { setNewType({ key: "", title_tr: "", title_en: "", is_active: true, order_no: 0 }); await loadTypes(); }
  }
  async function saveType(t: TypeRow) {
    setMsg(null);
    const j = await fetchJSON(`/api/admin/cv-block-types/${t.id}`, { method: "PUT", body: JSON.stringify(t) });
    if (!j.ok) setMsg(j.error || "Güncellenemedi");
    else await loadTypes();
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 border-b">
        <button onClick={()=>setTab("list")} className={"px-3 py-2 " + (tab==="list"?"border-b-2 border-black":"text-gray-500")}>
          Danışmanlar
        </button>
        <button onClick={()=>setTab("types")} className={"px-3 py-2 " + (tab==="types"?"border-b-2 border-black":"text-gray-500")}>
          CV Blokları
        </button>
      </div>

      {tab === "list" ? (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="text-left px-3 py-2">Kullanıcı</th>
                <th className="text-left px-3 py-2">Durum</th>
                <th className="text-left px-3 py-2">Ad (Display)</th>
                <th className="text-left px-3 py-2">Saat Ücreti</th>
                <th className="text-left px-3 py-2">Diller</th>
                <th className="text-left px-3 py-2">Etiketler</th>
                <th className="text-left px-3 py-2">Güncellendi</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-gray-500" colSpan={7}>Henüz worker profil yok.</td>
                </tr>
              ) : rows.map((r) => (
                <tr key={r.profile_id} className="border-t">
                  <td className="px-3 py-2 text-gray-600">
                    <Link href={`/admin/consultants/${r.profile_id}`} className="underline">{r.email || r.profile_id}</Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className={
                      "inline-flex items-center rounded px-2 py-0.5 text-xs " +
                      (r.cv?.status === "published"
                        ? "bg-green-100 text-green-700"
                        : r.cv?.status === "draft"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-700")
                    }>
                      {r.cv?.status || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.cv?.display_name || "-"}</td>
                  <td className="px-3 py-2">{r.cv ? `${fmtMoney(r.cv.hourly_rate_tl)} TL` : "-"}</td>
                  <td className="px-3 py-2 text-gray-600">{r.cv?.languages?.join(", ") || "-"}</td>
                  <td className="px-3 py-2 text-gray-600">{r.cv?.tags?.join(", ") || "-"}</td>
                  <td className="px-3 py-2 text-gray-600">{fmtDate(r.cv?.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border rounded p-3 space-y-3">
            <div className="font-medium">Yeni Blok Türü</div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <label className="flex flex-col gap-1">
                <span>Key</span>
                <input className="border rounded p-2" value={newType.key} onChange={e=>setNewType({...newType, key:e.target.value})} />
              </label>
              <label className="flex flex-col gap-1">
                <span>Başlık (TR)</span>
                <input className="border rounded p-2" value={newType.title_tr} onChange={e=>setNewType({...newType, title_tr:e.target.value})} />
              </label>
              <label className="flex flex-col gap-1">
                <span>Başlık (EN)</span>
                <input className="border rounded p-2" value={newType.title_en} onChange={e=>setNewType({...newType, title_en:e.target.value})} />
              </label>
              <label className="flex flex-col gap-1">
                <span>Sıra</span>
                <input type="number" className="border rounded p-2" value={newType.order_no} onChange={e=>setNewType({...newType, order_no:Number(e.target.value)})} />
              </label>
              <label className="flex items-center gap-2 mt-7">
                <input type="checkbox" checked={newType.is_active} onChange={e=>setNewType({...newType, is_active:e.target.checked})} />
                <span>Aktif</span>
              </label>
            </div>
            <button onClick={addType} className="px-3 py-2 bg-black text-white rounded">Ekle</button>
          </div>

          <div className="overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left px-3 py-2">Sıra</th>
                  <th className="text-left px-3 py-2">Key</th>
                  <th className="text-left px-3 py-2">Başlık (TR)</th>
                  <th className="text-left px-3 py-2">Başlık (EN)</th>
                  <th className="text-left px-3 py-2">Aktif</th>
                  <th className="text-left px-3 py-2">Kaydet</th>
                </tr>
              </thead>
              <tbody>
                {types.length === 0 ? (
                  <tr><td className="px-3 py-4 text-gray-500" colSpan={6}>Henüz tanım yok.</td></tr>
                ) : types.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2">
                      <input type="number" className="border rounded p-1 w-20" value={t.order_no} onChange={e=>setTypes(ts=>ts.map(x=>x.id===t.id?{...x, order_no:Number(e.target.value)}:x))} />
                    </td>
                    <td className="px-3 py-2">
                      <input className="border rounded p-1" value={t.key} onChange={e=>setTypes(ts=>ts.map(x=>x.id===t.id?{...x, key:e.target.value}:x))} />
                    </td>
                    <td className="px-3 py-2">
                      <input className="border rounded p-1 w-full" value={t.title_tr} onChange={e=>setTypes(ts=>ts.map(x=>x.id===t.id?{...x, title_tr:e.target.value}:x))} />
                    </td>
                    <td className="px-3 py-2">
                      <input className="border rounded p-1 w-full" value={t.title_en} onChange={e=>setTypes(ts=>ts.map(x=>x.id===t.id?{...x, title_en:e.target.value}:x))} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={t.is_active} onChange={e=>setTypes(ts=>ts.map(x=>x.id===t.id?{...x, is_active:e.target.checked}:x))} />
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={()=>saveType(t)} className="px-2 py-1 bg-black text-white rounded">Kaydet</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
