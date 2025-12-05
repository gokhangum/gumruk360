import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { MAIL, OWNER } from "@/lib/config/appEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

const FROM_DEFAULT =
  process.env.MAIL_FROM ||
  `${MAIL.fromName} <${MAIL.fromEmail}>`;

const RESEND_FROM_TR = process.env.RESEND_FROM_TR || "";
const RESEND_FROM_EN = process.env.RESEND_FROM_EN || "";

function getSiteBaseUrl() {
  const direct = process.env.NEXT_PUBLIC_SITE_URL;
  if (direct && direct.trim()) return direct.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.trim()) return `https://${vercel}`.replace(/\/$/, "");
  const tr = process.env.APP_BASE_URL_TR;
  if (tr && tr.trim()) return tr.replace(/\/$/, "");
  return "http://localhost:3000";
}

// Admin e-postaları (öncelik: ADMIN_NOTIFY_EMAILS -> ADMIN_EMAILS -> ADMIN_EMAIL -> MAIL.adminNotify -> OWNER.email)
function getAdminEmails(): string[] {
  const out: string[] = [];
  const csv =
    process.env.ADMIN_NOTIFY_EMAILS ||
    process.env.ADMIN_EMAILS ||
    "";
  if (csv) {
    for (const part of csv.split(",")) {
      const v = part.trim();
      if (v) out.push(v);
    }
  }
  const single = (process.env.ADMIN_EMAIL || "").trim();
  if (single) out.push(single);
  if (!out.length && Array.isArray(MAIL.adminNotify) && MAIL.adminNotify.length) {
    out.push(...MAIL.adminNotify);
  }
  if (!out.length && OWNER.email) {
    out.push(OWNER.email);
  }
  // tekilleştir
  return Array.from(new Set(out));
}

function renderTemplate(tmpl: string, ctx: Record<string, string>): string {
  return (tmpl || "").replace(/{{\s*(\w+)\s*}}/g, (_m, key) => {
    const k = String(key || "");
    return Object.prototype.hasOwnProperty.call(ctx, k) ? ctx[k] : "";
  });
}

function getFromForTenant(tenantDomain: string | null): string {
  if (!tenantDomain) return FROM_DEFAULT;
  const host = tenantDomain.toLowerCase();

  // gumruk360 tenantı için TR from
  if (host.includes("gumruk360") && RESEND_FROM_TR) {
    return RESEND_FROM_TR;
  }

  // easycustoms360 tenantı için EN from
  if (host.includes("easycustoms360") && RESEND_FROM_EN) {
    return RESEND_FROM_EN;
  }

  return FROM_DEFAULT;
}

type SlaRule = {
  id: string;
  name: string | null;
  tenant_id: string | null;
  is_active: boolean;
  minutes_before_sla: number;
  send_to_assignee: boolean;
  send_to_admins: boolean;
  allowed_question_statuses: string[] | null;
  allowed_answer_statuses: string[] | null;
  include_null_answer_status: boolean | null;
  subject_template: string;
  body_template: string;
};

type QuestionRow = {
  id: string;
  tenant_id: string | null;
  title: string | null;
  status: string;
  answer_status: string | null;
  sla_due_at: string | null;
  assigned_to: string | null;
};

type TenantRow = {
  id: string;
  primary_domain: string | null;
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";

   if (!isVercelCron && secret) {
    const provided =
    req.nextUrl.searchParams.get("key") ||
     req.headers.get("x-cron-secret");

  if (provided !== secret) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
       );
    }
  }


  if (!RESEND_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "RESEND_API_KEY missing" },
      { status: 500 }
    );
  }

  const resend = new Resend(RESEND_API_KEY);
  const baseUrl = getSiteBaseUrl();
  const adminEmails = getAdminEmails();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: rules, error: rulesErr } = await supabaseAdmin
    .from("sla_reminder_rules")
    .select("*")
    .eq("is_active", true)
    .order("minutes_before_sla", { ascending: true });

  if (rulesErr) {
    return NextResponse.json(
      { ok: false, error: rulesErr.message },
      { status: 500 }
    );
  }

  if (!rules || !rules.length) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  // Tenant domain haritası (id -> primary_domain)
  const tenantDomainById = new Map<string, string | null>();
  try {
    const { data: tenants } = await supabaseAdmin
      .from("tenants")
      .select("id, primary_domain");
    if (tenants) {
      for (const t of tenants as TenantRow[]) {
        tenantDomainById.set(t.id, t.primary_domain);
      }
    }
  } catch {
    // Tenant sorgusu patlarsa, sadece default FROM ile devam ederiz.
  }

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const rule of rules as SlaRule[]) {
    if (!rule.minutes_before_sla || rule.minutes_before_sla <= 0) continue;

    const minutes = rule.minutes_before_sla;
    const target = new Date(now.getTime() + minutes * 60 * 1000);
    const targetIso = target.toISOString();

    const statuses = (rule.allowed_question_statuses || ["approved"]).filter(Boolean);

    // aday sorular: seçili status'ler, sla_due_at gelecekte ve önümüzdeki N dakika içinde
    const { data: questions, error: qErr } = await supabaseAdmin
      .from("questions")
      .select("id, tenant_id, title, status, answer_status, sla_due_at, assigned_to")
      .in("status", statuses.length ? statuses : ["approved"])
      .gt("sla_due_at", nowIso)
      .lte("sla_due_at", targetIso)
      .limit(500);

    if (qErr) {
      failed++;
      continue;
    }

    const allowAnswers = (rule.allowed_answer_statuses || []).filter(Boolean);
    const includeNull =
      rule.include_null_answer_status === undefined ||
      rule.include_null_answer_status === null
        ? true
        : !!rule.include_null_answer_status;

    const candidates = (questions || []).filter((q: any) => {
      const row = q as QuestionRow;

      // tenant filtresi: kural tenant_id doluysa sadece o tenant'a ait sorular
      if (rule.tenant_id && row.tenant_id && row.tenant_id !== rule.tenant_id) {
        return false;
      }
      if (rule.tenant_id && !row.tenant_id) {
        return false;
      }

      const as = (row.answer_status ?? null) as string | null;
      if (as == null) {
        return includeNull;
      }
      if (!allowAnswers.length) return true;
      return allowAnswers.includes(as);
    }) as QuestionRow[];

    for (const q of candidates) {
      processed++;

      const tenantDomain =
        q.tenant_id ? tenantDomainById.get(q.tenant_id) ?? null : null;

      // Worker için
      if (rule.send_to_assignee && q.assigned_to) {
        const res = await sendSlaEmail({
          rule,
          question: q,
          role: "worker",
          baseUrl,
          resend,
          tenantDomain,
        });
        if (res === "sent") sent++;
        else if (res === "skipped") skipped++;
        else if (res === "failed") failed++;
      }

      // Adminler için
      if (rule.send_to_admins && adminEmails.length) {
        const res = await sendSlaEmail({
          rule,
          question: q,
          role: "admin",
          baseUrl,
          resend,
          adminEmails,
          tenantDomain,
        });
        if (res === "sent") sent++;
        else if (res === "skipped") skipped++;
        else if (res === "failed") failed++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    sent,
    skipped,
    failed,
  });
}

export const POST = GET;

type SendRole = "worker" | "admin";

async function sendSlaEmail(opts: {
  rule: SlaRule;
  question: QuestionRow;
  role: SendRole;
  baseUrl: string;
  resend: Resend;
  adminEmails?: string[];
  tenantDomain: string | null;
}): Promise<"sent" | "skipped" | "failed"> {
  const { rule, question: q, role, baseUrl, resend, adminEmails, tenantDomain } = opts;
  const event = `sla.rule.${rule.id}.${role}`;

  // Aynı kural + rol + soru için daha önce herhangi bir log varsa yeniden gönderme
  const { data: existing, error: existErr } = await supabaseAdmin
    .from("notification_logs")
    .select("id,status")
    .eq("event", event)
    .eq("entity_type", "question")
    .eq("entity_id", q.id)
    .limit(1);

  if (!existErr && existing && existing.length) {
    return "skipped";
  }

  // alıcı belirle
  let to: string | null = null;
  if (role === "worker") {
    if (!q.assigned_to) return "skipped";
    try {
      const userRes = await supabaseAdmin.auth.admin.getUserById(q.assigned_to);
      if (userRes.error || !userRes.data?.user?.email) return "skipped";
      to = userRes.data.user.email;
    } catch {
      return "failed";
    }
  } else {
    const admins = adminEmails || getAdminEmails();
    if (!admins.length) return "skipped";
    to = admins[0];
  }

  if (!to) return "skipped";

  const slaDue = q.sla_due_at ? new Date(q.sla_due_at) : null;
  const ctx: Record<string, string> = {
    id: q.id,
    title: q.title || "",
    minutes: String(rule.minutes_before_sla),
    slaDueAt: slaDue ? slaDue.toLocaleString("tr-TR") : "",
    workerUrl: `${baseUrl}/worker/read/${q.id}`,
    adminUrl: `${baseUrl}/admin/request/${q.id}`,
    role,
  };

  const subject = renderTemplate(
    rule.subject_template || "SLA hatırlatma",
    ctx
  );
  const bodyText =
    rule.body_template ||
    "“{{title}}” başlıklı soru için SLA süresinin dolmasına yaklaşık {{minutes}} dakika kaldı.";
  const body = renderTemplate(bodyText, ctx);
  const html = body
    .split("\n")
    .map((line) => `<p>${line.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("");

  // log oluştur
  const prePayload = {
    rule_id: rule.id,
    role,
    minutes_before_sla: rule.minutes_before_sla,
    base_url: baseUrl,
    worker_url: ctx.workerUrl,
    admin_url: ctx.adminUrl,
    rule_name: rule.name,
    tenant_domain: tenantDomain,
  };

  const { data: preLog, error: preErr } = await supabaseAdmin
    .from("notification_logs")
    .insert({
      event,
      status: "queued",
      provider: "resend",
      payload: prePayload,
      entity_type: "question",
      entity_id: q.id,
    })
    .select("id")
    .single();

  if (preErr || !preLog) {
    return "failed";
  }

  try {
    const fromAddress = getFromForTenant(tenantDomain);

    const resp = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
    });
    const providerId = (resp as any)?.id || null;

    await supabaseAdmin
      .from("notification_logs")
      .update({
        status: "sent",
        to_email: to,
        subject,
        provider_id: providerId,
      })
      .eq("id", preLog.id);

    return "sent";
  } catch (err: any) {
    await supabaseAdmin
      .from("notification_logs")
      .update({
        status: "failed",
        error: String(err?.message || err),
      })
      .eq("id", preLog.id);
    return "failed";
  }
}
