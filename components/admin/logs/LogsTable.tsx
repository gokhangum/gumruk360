"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type AnyRecord = Record<string, any>;

type ApiResult = {
  ok: boolean;
  rows?: AnyRecord[];
  total?: number;
  next_page_token?: string;
  error?: string;
  detail?: string;
};

type Props = {
  /** Örn: /api/admin/log?type=audit */
  endpoint: string;
};

export default function LogsTable({ endpoint }: Props) {
  const [data, setData] = useState<AnyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unauth, setUnauth] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Basit filtreler
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Veri çekimi için sorgu (API path + query)
  const query = useMemo(() => {
    const u = new URL(
      endpoint,
      typeof window === "undefined" ? "http://dummy.local" : window.location.origin
    );
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("offset", String((page - 1) * limit));
    if (q) u.searchParams.set("q", q);
    if (actor) u.searchParams.set("actor", actor);
    if (action) u.searchParams.set("action", action);
    if (dateFrom) u.searchParams.set("from", dateFrom);
    if (dateTo) u.searchParams.set("to", dateTo);
    return u.pathname + u.search;
  }, [endpoint, limit, page, q, actor, action, dateFrom, dateTo]);

  // CSV export linki (SSR/Client aynı hesaplama → hydration mismatch yok)
  const exportHref = useMemo(() => {
    // Window'a ihtiyaç yok; query'yi kök olarak alıp path'i export'a çeviriyoruz
    const u = new URL(query, "http://dummy.local");
    u.pathname = u.pathname.replace(/\/api\/admin\/log$/, "/api/admin/log/export");
    u.searchParams.set("offset", "0");
    u.searchParams.set("limit", "1000");
    return u.pathname + u.search;
  }, [query]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr(null);
      setUnauth(false);
      setData([]);

      try {
        const res = await fetch(query, {
          cache: "no-store",
          headers: { accept: "application/json" },
        });

        // 401/403: oturum/izin yok → JSON beklemeyelim, doğrudan login linki önerelim
        if (res.status === 401 || res.status === 403) {
          if (!mounted) return;
          setUnauth(true);
          return;
        }

        // 404 vb: JSON dışı içerik dönmüş olabilir (HTML hata sayfası)
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const text = await res.text();
          if (!mounted) return;
          const snippet = (text || "").slice(0, 120);
          const hint = res.redirected
            ? "İstek JSON yerine HTML’e yönlendirildi (muhtemelen login veya 404 sayfası)."
            : "İstek JSON yerine farklı içerik döndürdü.";
          setErr(
            `${hint} status=${res.status} content-type=${ct || "-"} snippet="${snippet}"`
          );
          return;
        }

        const json: ApiResult = await res.json();
        if (!mounted) return;

        if (!json?.ok) {
          setErr(json?.detail || json?.error || `API hata döndürdü (status=${res.status}).`);
          setData([]);
        } else {
          setData(Array.isArray(json.rows) ? json.rows : []);
        }
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || "İstek başarısız");
        setData([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [query]);

  // Kolonları otomatik üret: mevcut kayıtların anahtarlarının birleşimi
  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const r of data) Object.keys(r || {}).forEach((k) => keys.add(k));
    // Faydalı sütunlar öne
    const preferred = [
      "created_at",
      "time",
      "level",
      "type",
      "action",
      "actor",
      "actor_email",
      "ip",
      "resource_type",
      "resource_id",
      "entity_type",
      "entity_id",
      "message",
      "subject",
      "event",
      "status",
      "resource_path",
      "detail",
    ];
    const ordered = [
      ...preferred.filter((k) => keys.has(k)),
      ...[...keys].filter((k) => !preferred.includes(k)),
    ];
    return ordered;
  }, [data]);

  function renderCell(k: string, v: any) {
    if (v == null) return <span className="text-gray-400">—</span>;

    // Tarih gibi gözükenler
    if (k === "created_at" || k === "time" || /_at$/.test(k)) {
      try {
        const dt = new Date(v);
        return <span title={dt.toISOString()}>{dt.toLocaleString()}</span>;
      } catch {
        /* ignore */
      }
    }

    // Link alanları
    if (k === "resource_url" && typeof v === "string") {
      return (
        <Link
          className="text-blue-600 underline"
          href={v.startsWith("/") ? v : `/${v.replace(/^https?:\/\/[^/]+/, "")}`}
        >
          {v}
        </Link>
      );
    }
    if (k === "resource_path" && typeof v === "string") {
      return (
        <Link className="text-blue-600 underline" href={v.startsWith("/") ? v : `/${v}`}>
          {v}
        </Link>
      );
    }

    // Nesne/array ise: tam göster, yatay scroll ile kesme
  if (typeof v === "object") {
    const s = JSON.stringify(v);
   return (
       <div className="max-w-full overflow-x-auto text-xs font-mono whitespace-pre">
          {s}
       </div>
      );
     }

    // Metin uzunsa: tam göster, yatay scroll ile kesme
    if (typeof v === "string" && v.length > 120) {
      return (
         <div className="max-w-full overflow-x-auto text-xs font-mono whitespace-pre">
           {v}
        </div>
     );
    }

    return <span>{String(v)}</span>;

  }

  const loginHref =
    typeof window !== "undefined"
      ? `/admin/login?next=${encodeURIComponent(
          window.location.pathname + window.location.search
        )}`
      : "/admin/login";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Serbest Ara</label>
          <input
            className="card-surface"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="kelime, id, mesaj…"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Aktör</label>
          <input
            className="card-surface"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="email / uid"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Aksiyon</label>
          <input
            className="card-surface"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="create / update…"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Tarih (başlangıç)</label>
          <input
            className="card-surface"
            type="datetime-local"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Tarih (bitiş)</label>
          <input
            className="card-surface"
            type="datetime-local"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        {/* Sağ taraf: CSV + durum alanı */}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <a
            href={exportHref}
            className="btn btn--outline hover:bg-gray-50"
            title="Filtrelere göre ilk 1000 kaydı CSV indir"
          >
            CSV indir
          </a>

          {loading ? (
            <span>Yükleniyor…</span>
          ) : unauth ? (
            <span className="text-amber-700">
              Yetki gerekli —{" "}
              <Link className="underline" href={loginHref}>
                Giriş yap
              </Link>
            </span>
          ) : err ? (
            <span className="text-red-600">{err}</span>
          ) : null}
        </div>
      </div>

      <div className="card-surface">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  className="text-left px-3 py-2 whitespace-nowrap font-medium border-b"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-gray-500" colSpan={columns.length}>
                  {loading
                    ? "Yükleniyor…"
                    : unauth
                    ? "Bu veriyi görmek için giriş yapmalısınız."
                    : err
                    ? "Kayıt getirilemedi."
                    : "Kayıt bulunamadı."}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} className="odd:card-surface even:bg-gray-50">
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-2 align-top border-b">
                      {renderCell(c, row?.[c])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="btn btn--outline disabled:opacity-50"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
        >
          ◀ Önceki
        </button>
        <span className="text-sm">Sayfa {page}</span>
        <button
          className="btn btn--outline disabled:opacity-50"
          onClick={() => setPage((p) => p + 1)}
          disabled={loading || data.length < limit}
        >
          Sonraki ▶
        </button>

        <div className="ml-2 text-xs text-gray-500">
          (Sayfa boyutu: {limit})
        </div>
      </div>
    </div>
  );
}
