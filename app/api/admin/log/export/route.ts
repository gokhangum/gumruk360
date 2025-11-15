import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

/** Yardımcılar */
function clampNum(input: string | null, def: number, min = 0, max = 1000) {
  const n = Number(input ?? def);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}
function isMissingTableMessage(msg = "") {
  return /schema cache/i.test(msg) || /does not exist/i.test(msg) || /undefined_table/i.test(msg);
}
function parseFilters(url: URL) {
  const q = (url.searchParams.get("q") || "").trim();
  const actor = (url.searchParams.get("actor") || "").trim();
  const action = (url.searchParams.get("action") || "").trim();
  const fromRaw = url.searchParams.get("from") || "";
  const toRaw = url.searchParams.get("to") || "";
  const fromIso = fromRaw ? new Date(fromRaw).toISOString() : null;
  const toIso = toRaw ? new Date(toRaw).toISOString() : null;
  return { q, actor, action, fromIso, toIso };
}

/** Filtreli sorgu (yalnızca public + bilinen tablolar) */
async function fetchRows(
  type: "audit" | "notifications",
  limit: number,
  offset: number,
  filters: ReturnType<typeof parseFilters>,
) {
  const schema = "public";
  const tables = type === "notifications"
    ? ["notification_logs", "admin_notifications", "notifications", "system_notifications"]
    : ["audit_logs", "audit_log"];

  let lastErr: any = null;

  for (const table of tables) {
    try {
      const client = supabaseAdmin.schema(schema);
      let q1 = client.from(table).select("*", { count: "exact" });

      if (filters.fromIso) q1 = q1.gte("created_at", filters.fromIso);
      if (filters.toIso) q1 = q1.lte("created_at", filters.toIso);

      if (filters.actor) {
        if (type === "notifications") {
          q1 = q1.or(`to_email.ilike.%${filters.actor}%,provider.ilike.%${filters.actor}%`);
        } else {
          q1 = q1.or([
            `actor_role.ilike.%${filters.actor}%`,
            `actor_id.eq.${filters.actor}`,
            `actor_user_id.eq.${filters.actor}`,
            `user_id.eq.${filters.actor}`,
            `ip.ilike.%${filters.actor}%`,
            `user_agent.ilike.%${filters.actor}%`,
          ].join(","));
        }
      }

      if (filters.action) {
        if (type === "notifications") {
          q1 = q1.or(`event.ilike.%${filters.action}%,subject.ilike.%${filters.action}%,status.ilike.%${filters.action}%`);
        } else {
          q1 = q1.or(`action.ilike.%${filters.action}%,event.ilike.%${filters.action}%`);
        }
      }

      if (filters.q) {
        if (type === "notifications") {
          q1 = q1.or([
            `event.ilike.%${filters.q}%`,
            `subject.ilike.%${filters.q}%`,
            `to_email.ilike.%${filters.q}%`,
            `provider.ilike.%${filters.q}%`,
            `provider_id.ilike.%${filters.q}%`,
            `entity_type.ilike.%${filters.q}%`,
            `entity_id.ilike.%${filters.q}%`,
            `status.ilike.%${filters.q}%`,
            `error.ilike.%${filters.q}%`,
          ].join(","));
        } else {
          q1 = q1.or([
            `action.ilike.%${filters.q}%`,
            `event.ilike.%${filters.q}%`,
            `resource_type.ilike.%${filters.q}%`,
            `resource_id.ilike.%${filters.q}%`,
            `entity_type.ilike.%${filters.q}%`,
            `entity_id.ilike.%${filters.q}%`,
            `actor_role.ilike.%${filters.q}%`,
            `ip.ilike.%${filters.q}%`,
            `user_agent.ilike.%${filters.q}%`,
          ].join(","));
        }
      }

      // created_at ile sırala; yoksa sırasız fallback
      let { data, error } = await q1.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (error?.code === "42703") {
        const r2 = await q1.range(offset, offset + limit - 1);
        data = r2.data; error = r2.error;
      }
      if (error) throw error;
      return { schema, table, rows: data ?? [] };
    } catch (e: any) {
      lastErr = e;
      const msg = e?.message || "";
      if (isMissingTableMessage(msg) || e?.code === "42P01") {
        // tablo yoksa sıradakini dene
        continue;
      }
      // farklı hata → yine de sıradakini denemeye devam
      continue;
    }
  }

  return { schema: "public", table: tables[0], rows: [] as any[], error: lastErr };
}

function toCSV(rows: any[]): string {
  if (!rows?.length) return "";
  // Tüm anahtarların birleşimi ile başlık oluştur
  const keySet = new Set<string>();
  for (const r of rows) Object.keys(r || {}).forEach(k => keySet.add(k));
  const columns = Array.from(keySet);

  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    // CSV-safe: " → ""
    const q = s.replace(/"/g, '""');
    return `"${q}"`;
  };

  const header = columns.map(escape).join(",");
  const lines = rows.map(r => columns.map(c => escape(r?.[c])).join(","));
  return [header, ...lines].join("\n");
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const type = (url.searchParams.get("type") || "audit").toLowerCase() as "audit" | "notifications";
    const limit = clampNum(url.searchParams.get("limit"), 1000, 1, 5000); // export için üst sınırı biraz artırdık
    const offset = clampNum(url.searchParams.get("offset"), 0, 0, 1_000_000);
    const filters = parseFilters(url);

    const { schema, table, rows } = await fetchRows(type, limit, offset, filters);

    const csv = toCSV(rows);
    const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    const filename = `${type}_logs_${ts}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Source-Table": `${schema}.${table}`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "internal_error", detail: e?.message || String(e) }, { status: 500 });
  }
}
