async function sendResendEmail(to: string, subject: string, html: string){try{const apiKey=process.env.RESEND_API_KEY;const from=process.env.RESEND_FROM_TR || `${BRAND.nameTR} <${MAIL.fromEmail}>`;if(!apiKey)return false;const res=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to,subject,html})});return res.ok}catch(e){return false}}
function resolveBaseUrl(){const site=process.env.NEXT_PUBLIC_SITE_URL;const vercel=process.env.VERCEL_URL;if(site)return site.replace(/\/$/,"");if(vercel)return `https://${vercel}`.replace(/\/$/,"");return "http://localhost:3000";}
// app/api/payments/mock/mark-paid/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import { getTranslations } from "next-intl/server";
import { BRAND, MAIL } from "@/lib/config/appEnv";
export const runtime = "nodejs";

function parseForm(body: string): Record<string,string> {
  const out: Record<string,string> = {};
  body.split("&").forEach(kv => {
    const [k, v] = kv.split("=");
    if (!k) return;
    out[decodeURIComponent(k)] = decodeURIComponent((v || "").replace(/\+/g, " "));
  });
  return out;
}

async function getOrderIdFromRequest(req: Request): Promise<string | null> {
  try {
    const url = new URL(req.url);
    const fromQuery = url.searchParams.get("orderId") || url.searchParams.get("id");
    if (fromQuery) return String(fromQuery).trim();

    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      const j = await req.json().catch(() => ({} as any));
      const id = j?.orderId || j?.id;
      if (id) return String(id).trim();
      return null;
    }
    if (ct.includes("application/x-www-form-urlencoded")) {
      const txt = await req.text();
      const form = parseForm(txt);
      const id = form["orderId"] || form["id"];
      if (id) return String(id).trim();
      return null;
    }
    // Fallback: try text
    const raw = await req.text().catch(() => "");
    try {
      const j = JSON.parse(raw);
      const id = j?.orderId || j?.id;
      if (id) return String(id).trim();
    } catch {}
    return null;
  } catch {
    return null;
  }
}

async function handle(orderId: string) {
  const { data: order, error: selErr } = await supabaseAdmin
    .from("orders")
    .select("id, status, provider, provider_ref, question_id")
    .eq("id", orderId)
    .single();

  if (selErr || !order) {
    return NextResponse.json({ ok:false, error:"order_not_found", detail: selErr?.message ?? null }, { status: 404 });
  }

  if (order.status === "paid") {
    return NextResponse.json({ ok:true, data:{ order_id: order.id, status: "paid", noop: true } }, { status: 200 });
  }

  const { error: updErr } = await supabaseAdmin
    .from("orders")
    .update({
      status: "paid",
      provider: order.provider || "mock",
      provider_ref: order.provider_ref || "mock",
    } as any)
    .eq("id", order.id);

  if (updErr) {
    return NextResponse.json({ ok:false, error:"update_failed", detail: updErr.message }, { status: 500 });
  }


  // send worker email (mock)
  try{
    const qSel = await supabaseAdmin.from("questions").select("id,assigned_to").eq("id", order.question_id).maybeSingle();
    const qrow = qSel.data || null;
    const wid = qrow?.assigned_to || null;
    let workerEmail="";
    if (wid){
      const pr = await supabaseAdmin.from("profiles").select("email").eq("id", wid).maybeSingle();
      if (!pr.error && pr.data?.email) workerEmail=pr.data.email;
      if (!workerEmail){
        const au = await supabaseAdmin.auth.admin.getUserById(wid as any).catch(()=>null);
        const u=(au && (au.data as any)?.user) || null;
        if (u && u.email) workerEmail=u.email;
      }
    }
    if (qrow && workerEmail){
		const t = await getTranslations("emails.assignment");
      const baseUrl = resolveBaseUrl();
      const askLink = `${baseUrl}/worker/editor/${qrow.id}`;
      const panelLink = `${baseUrl}/worker`;
      const subject = t("subject");
      const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">
    <h2 style="margin:0 0 12px">${t("title")}</h2>
     <p><b>${t("questionId")}:</b> <a href="${askLink}..." style="color:#2563eb;text-decoration:none">${qrow.id}</a></p>
     <p><b>${t("paymentAmount")}:</b> 0 TL</p>
     <p><b>${t("creditAmount")}:</b> 0</p>
     <p><b>${t("paymentMethod")}:</b> Paytr</p>
     <a href="${panelLink}" ... >${t("goToPanel")}</a>
        <a href="${askLink}" ... >${t("goToQuestion")}</a>
    <p style="margin-top:16px">${t("regards")}</p>

      </div>`;
      await sendResendEmail(workerEmail, subject, html);
    }
  }catch{}
    
  return NextResponse.json({ ok:true, data:{ order_id: order.id, status: "paid" } }, { status: 200 });
}

export async function POST(req: Request) {
  try {
    const orderId = await getOrderIdFromRequest(req);
    if (!orderId) return NextResponse.json({ ok:false, error:"missing_order_id" }, { status: 400 });
    return await handle(orderId);
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:"mock.mark-paid.failed", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("orderId") || url.searchParams.get("id");
    if (!orderId) return NextResponse.json({ ok:false, error:"missing_order_id" }, { status: 400 });
    return await handle(String(orderId));
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:"mock.mark-paid.failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
