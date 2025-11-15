import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type QueryOk = { ok: true; rows: any[]; total: number; schema: string; table: string };
type QueryMissing = { ok: false; missing: true; schema: string; table: string };
type QueryFail = { ok: false; missing: false; error: string; code?: string; schema: string; table: string };

function isMissingTableMessage(msg = "") {
  return /schema cache/i.test(msg) || /does not exist/i.test(msg) || /undefined_table/i.test(msg);
}

function clampNum(input: string | null, def: number, min = 0, max = 1000) {
  const n = Number(input ?? def);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

/** Satırlardan tıklanabilir bir yol türet (varsa mevcut resource_path'i korur). */
function deriveResourcePath(row: any): string | null {
  if (!row || typeof row !== "object") return null;
  if (row.resource_path && typeof row.resource_path === "string") return row.resource_path;

  // Notification şemasında: entity_type + entity_id kombinasyonu
  if (row.entity_type === "order" && row.entity_id) return `/admin/orders/${row.entity_id}`;
  if (row.entity_type === "payment" && row.entity_id) return `/admin/payments/${row.entity_id}`;
  if (row.entity_type === "question" && row.entity_id) return `/admin/request/${row.entity_id}`;

  // Audit satırlarında farklı isimler olabilir (ör: resource_type/resource_id)
  if (row.resource_type === "order" && row.resource_id) return `/admin/orders/${row.resource_id}`;
  if (row.resource_type === "payment" && row.resource_id) return `/admin/payments/${row.resource_id}`;
  if (row.resource_type === "question" && row.resource_id) return `/admin/request/${row.resource_id}`;

  return null;
}

/** URL'den filtreleri oku ve normalize et */
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

/** Filtreli sorgu: created_at varsa ona göre sırala, yoksa sırasız fallback */
async function queryWithFilters(
  schema: string,
  table: string,
  type: "audit" | "notifications",
  limit: number,
  offset: number,
  filters: ReturnType<typeof parseFilters>
): Promise<QueryOk | QueryMissing | QueryFail> {
  try {
    const client = supabaseAdmin.schema(schema);

    // Ortak SELECT
    let q1 = client.from(table).select("*", { count: "exact" });

    // Tarih aralığı
    if (filters.fromIso) q1 = q1.gte("created_at", filters.fromIso);
    if (filters.toIso) q1 = q1.lte("created_at", filters.toIso);

    // Actor filtresi
    if (filters.actor) {
      if (type === "notifications") {
        // to_email veya provider üzerinden
        q1 = q1.or(
          `to_email.ilike.%${filters.actor}%,provider.ilike.%${filters.actor}%`
        );
      } else {
        // audit: actor_role (ilike) veya id'ler (eq) ya da ip/user_agent (ilike)
        q1 = q1.or(
          [
            `actor_role.ilike.%${filters.actor}%`,
            `actor_id.eq.${filters.actor}`,
            `actor_user_id.eq.${filters.actor}`,
            `user_id.eq.${filters.actor}`,
            `ip.ilike.%${filters.actor}%`,
            `user_agent.ilike.%${filters.actor}%`,
          ].join(",")
        );
      }
    }

    // Action filtresi
    if (filters.action) {
      if (type === "notifications") {
        q1 = q1.or(
          `event.ilike.%${filters.action}%,subject.ilike.%${filters.action}%,status.ilike.%${filters.action}%`
        );
      } else {
        q1 = q1.or(
          `action.ilike.%${filters.action}%,event.ilike.%${filters.action}%`
        );
      }
    }

    // Serbest arama (q)
    if (filters.q) {
      if (type === "notifications") {
        q1 = q1.or(
          [
            `event.ilike.%${filters.q}%`,
            `subject.ilike.%${filters.q}%`,
            `to_email.ilike.%${filters.q}%`,
            `provider.ilike.%${filters.q}%`,
            `provider_id.ilike.%${filters.q}%`,
            `entity_type.ilike.%${filters.q}%`,
            `entity_id.ilike.%${filters.q}%`,
            `status.ilike.%${filters.q}%`,
            `error.ilike.%${filters.q}%`,
          ].join(",")
        );
      } else {
        q1 = q1.or(
          [
            `action.ilike.%${filters.q}%`,
            `event.ilike.%${filters.q}%`,
            `resource_type.ilike.%${filters.q}%`,
            `resource_id.ilike.%${filters.q}%`,
            `entity_type.ilike.%${filters.q}%`,
            `entity_id.ilike.%${filters.q}%`,
            `actor_role.ilike.%${filters.q}%`,
            `ip.ilike.%${filters.q}%`,
            `user_agent.ilike.%${filters.q}%`,
          ].join(",")
        );
      }
    }

    // Önce created_at ile sırala
    let qOrdered = q1.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    let { data, error, count } = await qOrdered;
    if (!error) {
      return { ok: true, rows: data ?? [], total: count ?? 0, schema, table };
    }

    // created_at yoksa (42703) → sırasız fallback
    if (error?.code === "42703") {
      const { data: d2, error: e2, count: c2 } = await q1.range(offset, offset + limit - 1);
      if (!e2) {
        return { ok: true, rows: d2 ?? [], total: c2 ?? 0, schema, table };
      }
      if (isMissingTableMessage(e2?.message) || e2?.code === "42P01") {
        return { ok: false, missing: true, schema, table };
      }
      return { ok: false, missing: false, error: e2.message || "query_failed", code: e2.code, schema, table };
    }

    // Tablo yok mu?
    if (isMissingTableMessage(error?.message) || error?.code === "42P01") {
      return { ok: false, missing: true, schema, table };
    }

    return { ok: false, missing: false, error: error.message || "query_failed", code: error.code, schema, table };
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (isMissingTableMessage(msg)) {
      return { ok: false, missing: true, schema, table };
    }
    return { ok: false, missing: false, error: msg, schema, table };
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const type = (url.searchParams.get("type") || "audit").toLowerCase() as "audit" | "notifications";
    const limit = clampNum(url.searchParams.get("limit"), 25, 1, 200);
    const offset = clampNum(url.searchParams.get("offset"), 0, 0, 100000);
    const filters = parseFilters(url);

    // İsteğe bağlı override — SADECE public / graphql_public kabul
    const schemaOverrideRaw = url.searchParams.get("schema") || undefined;
    const allowedSchemas = new Set(["public", "graphql_public"]);
    const schemaCandidates = schemaOverrideRaw && allowedSchemas.has(schemaOverrideRaw)
      ? [schemaOverrideRaw]
      : ["public"]; // ← logs şeması kaldırıldı

    // Tablo adayları:
    // - AUDIT için: önce 'audit_logs' (kanonik), sonra 'audit_log' (fallback)
    // - NOTIFICATIONS için: önce 'notification_logs' (kanonik), sonra diğer olası adlar
    const tableOverride = url.searchParams.get("table") || undefined;
    const tableCandidates =
      (tableOverride ? [tableOverride] :
        type === "notifications"
          ? ["notification_logs", "admin_notifications", "notifications", "system_notifications"]
          : ["audit_logs", "audit_log"]);

    let lastFail: QueryFail | null = null;

    for (const schema of schemaCandidates) {
      for (const table of tableCandidates) {
        const r = await queryWithFilters(schema, table, type, limit, offset, filters);
        if (r.ok) {
          // rows'u link türeterek zenginleştir
          const mappedRows = Array.isArray(r.rows)
            ? r.rows.map((row: any) => {
                const rp = deriveResourcePath(row);
                return rp ? { ...row, resource_path: rp } : row;
              })
            : [];

          return NextResponse.json(
            { ok: true, rows: mappedRows, total: r.total, schema: r.schema, table: r.table },
            { status: 200 }
          );
        }
        if (!r.missing) {
          lastFail = r as QueryFail; // diğer adayları denemeye devam
        }
        // missing ise sıradakini dene
      }
    }

    if (lastFail) {
      return NextResponse.json(
        {
          ok: false,
          error: "query_failed",
          detail: lastFail.error,
          code: lastFail.code,
          tried: { schemas: schemaCandidates, tables: tableCandidates },
        },
        { status: 500 }
      );
    }

    // Hiçbir aday bulunamadı → boş set + ipucu
    return NextResponse.json(
      {
        ok: true,
        rows: [],
        total: 0,
        hint:
          type === "audit"
            ? "Audit tablosu bulunamadı. Varsayılan aranan tablolar: public.audit_logs, public.audit_log. İstersen ?table= ile belirt."
            : "Bildirim tablosu bulunamadı. Varsayılan aranan tablolar: public.notification_logs, public.admin_notifications, public.notifications, public.system_notifications. İstersen ?table= ile belirt.",
        tried: { schemas: schemaCandidates, tables: tableCandidates },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
