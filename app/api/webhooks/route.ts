// app/api/webhooks/resend/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendEventPayload = {
  type?: string; // e.g. "email.sent", "email.delivered", "email.bounced", ...
  event?: string;
  id?: string;
  data?: {
    id?: string;
    email_id?: string;
    to?: string | string[] | { email: string }[];
    subject?: string;
    template_id?: string | null;
    tags?: Array<{ name?: string; value?: string } | string> | Record<string, any>;
    [k: string]: any;
  };
  [k: string]: any;
};

function getIp(req: NextRequest): string | null {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return null;
}

function normalizeToEmails(data: ResendEventPayload["data"]): string | null {
  if (!data) return null;
  const to = data.to;
  if (!to) return null;
  if (typeof to === "string") return to;
  if (Array.isArray(to)) {
    const list = to
      .map((t) => (typeof t === "string" ? t : (t && (t as any).email) || null))
      .filter(Boolean) as string[];
    return list.length ? list.join(",") : null;
  }
  return null;
}

function extractTenantIdFromTags(
 tags: Record<string, any> | string[] | null | undefined
 ): string | null {
  if (!tags) return null;
  try {
    // tags array olabilir, obje olabilir; en yaygın varyasyonları yakalıyoruz
    if (Array.isArray(tags)) {
      for (const t of tags) {
        if (typeof t === "string") {
          // "tenant:abc" gibi bir biçim varsayalım
          const m = /^tenant[:=](.+)$/i.exec(t.trim());
          if (m) return m[1];
        } else if (t && typeof t === "object") {
          const name = (t as any).name ?? (t as any).key ?? null;
          const value = (t as any).value ?? null;
          if (name && /tenant(_id)?/i.test(String(name)) && value) return String(value);
        }
      }
    } else if (typeof tags === "object") {
      for (const [k, v] of Object.entries(tags)) {
        if (/tenant(_id)?/i.test(k) && v) return String(v);
      }
    }
  } catch {}
  return null;
}

function mapEventToStatus(eventType: string | undefined): {
  event: string | null;
  status: string | null;
} {
  if (!eventType) return { event: null, status: null };
  const e = eventType.toLowerCase();

  // Resend olayı → standart durum
  if (e.includes("queued")) return { event: eventType, status: "queued" };
  if (e.includes("sent")) return { event: eventType, status: "sent" };
  if (e.includes("delivered")) return { event: eventType, status: "delivered" };
  if (e.includes("opened")) return { event: eventType, status: "opened" };
  if (e.includes("clicked")) return { event: eventType, status: "clicked" };
  if (e.includes("bounced") || e.includes("bounce")) return { event: eventType, status: "bounced" };
  if (e.includes("complain") || e.includes("spam")) return { event: eventType, status: "complained" };
  if (e.includes("drop") || e.includes("discard")) return { event: eventType, status: "dropped" };
  if (e.includes("delay")) return { event: eventType, status: "delayed" };
  return { event: eventType, status: "unknown" };
}

async function verifySignatureOrThrow(req: NextRequest, rawBody: string) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Secret yoksa doğrulama yapamıyoruz: güvenlik amacıyla 401 verelim.
    throw new Error("Missing RESEND_WEBHOOK_SECRET");
  }

  // Resend webhooks uses Svix headers
  const svix_id = req.headers.get("svix-id");
  const svix_timestamp = req.headers.get("svix-timestamp");
  const svix_signature = req.headers.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    throw new Error("Missing Svix signature headers");
  }

  // "svix" paketini runtime'da yükleyip doğruluyoruz
  let Webhook: any;
  try {
    ({ Webhook } = await import("svix"));
  } catch (e) {
    throw new Error("Missing 'svix' dependency. Please install: npm i svix");
  }

  try {
    const wh = new Webhook(secret);
    // Doğrulama: hata atarsa catch'e düşer
    wh.verify(rawBody, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (err) {
    throw new Error("Invalid webhook signature");
  }
}

export async function POST(req: NextRequest) {
  let raw = "";
  try {
    raw = await req.text();

    // İmza doğrulama
    await verifySignatureOrThrow(req, raw);

    // Payload parse
    const payload = JSON.parse(raw) as ResendEventPayload;

    // Olay tipi ve durum
    const eventType = payload.type || payload.event || (payload as any).name || "unknown";
    const { event, status } = mapEventToStatus(eventType);

    // Alanlar
    const provider = "resend";
    const provider_id =
      payload?.data?.email_id ||
      payload?.data?.id ||
      payload?.id ||
      null;

    const to_email = normalizeToEmails(payload.data || {});
    const subject = payload?.data?.subject ?? null;
    const template = (payload?.data?.template_id ?? null) as string | null;
    const tenant_id =
      extractTenantIdFromTags(payload?.data?.tags) ||
      null;

    // Idempotent upsert: (provider, provider_id) üzerinde unique index var
    const upsertObj: any = {
      provider,
      provider_id,
      event: event ?? null,
      status: status ?? null,
      to_email,
      subject,
      template,
      entity_type: "email",
      entity_id: provider_id,
      tenant_id,
      payload: payload, // ham JSON
    };

    const { data: notifRows, error: notifErr } = await supabaseAdmin
      .from("notification_logs")
      .upsert(upsertObj, { onConflict: "provider,provider_id" })
      .select("id")
      .limit(1);

    if (notifErr) {
      // Kayıt sırasında hata olursa yine de 200/202 dönelim ama audit'e geçirip raporlayalım
      await supabaseAdmin.from("audit_logs").insert({
        actor_role: "system",
        action: "webhook.resend.error",
        resource_type: "notification",
        resource_id: null,
        event: `notify.error`,
        entity_type: "email",
        entity_id: provider_id,
        ip: getIp(req),
        user_agent: req.headers.get("user-agent"),
        payload: { error: notifErr, payload },
      });
      return NextResponse.json({ ok: false, error: notifErr.message }, { status: 202 });
    }

    const resource_id = notifRows?.[0]?.id ?? null;

    // Audit kaydı (başarılı)
    await supabaseAdmin.from("audit_logs").insert({
      actor_role: "system",
      action: "webhook.resend",
      resource_type: "notification",
      resource_id,
      event: `notify.${status ?? "unknown"}`,
      entity_type: "email",
      entity_id: provider_id,
      ip: getIp(req),
      user_agent: req.headers.get("user-agent"),
      payload,
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: any) {
    // İmza doğrulama/parse vb. hatalarda 401/400
    const code =
      err?.message === "Missing RESEND_WEBHOOK_SECRET" ||
      err?.message === "Missing Svix signature headers" ||
      err?.message === "Missing 'svix' dependency. Please install: npm i svix" ||
      err?.message === "Invalid webhook signature"
        ? 401
        : 400;

    // Audit'e düşürelim
    try {
      await supabaseAdmin.from("audit_logs").insert({
        actor_role: "system",
        action: "webhook.resend.reject",
        resource_type: "notification",
        resource_id: null,
        event: "notify.reject",
        entity_type: "email",
        entity_id: null,
        ip: getIp(req),
        user_agent: req.headers.get("user-agent"),
        payload: { error: err?.message ?? String(err) },
      });
    } catch {}

    return NextResponse.json({ ok: false, error: err?.message ?? "invalid" }, { status: code });
  }
}
