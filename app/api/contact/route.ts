// app/api/contact/route.ts (unified content & attachments for admin + user; robust attachments)
import { NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

function refCode() {
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 8).toUpperCase();
  } catch {
    return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0").toUpperCase();
  }
}

function parseAdminList(raw: string | undefined): string[] {
  const s = (raw || "").trim();
  if (!s) return [];
  const parts = s.split(/[;,\n]+/).map(v => v.trim()).filter(Boolean);
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return parts.filter(p => re.test(p));
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const email = String(form.get("email") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const subject = String(form.get("subject") || "").trim();
    const message = String(form.get("message") || "").trim();
    const locale = String(form.get("locale") || "tr").toLowerCase();

    if (!email || !subject || !message) {
      return NextResponse.json({ ok: false, message: "Missing required fields." }, { status: 400 });
    }

    const adminList = parseAdminList(process.env.ADMIN_EMAILS);
    if (adminList.length === 0) {
      return NextResponse.json({ ok: false, message: "ADMIN_EMAILS misconfigured." }, { status: 500 });
    }

    const from =
      locale.startsWith("tr")
        ? (process.env.RESEND_FROM_TR || process.env.MAIL_FROM || "Gümrük360 <no-reply@gumruk360.com>")
        : (process.env.RESEND_FROM_EN || process.env.MAIL_FROM || "Easycustoms360 <no-reply@gumruk360.com>");

    const resendApiKey = (process.env.RESEND_API_KEY || "").trim();
    if (!resendApiKey) {
      return NextResponse.json({ ok: false, message: "Email service is not configured." }, { status: 500 });
    }
    const resend = new Resend(resendApiKey);
    const reference = refCode();

    // COMMON mail content (same for user and admins)
    const commonSubject = (locale.startsWith("tr")
      ? "Mesajınızı aldık"
      : "We received your message") + ` — ${reference}`;

    const commonHtml = locale.startsWith("tr")
      ? `<p>Merhaba,</p>
         <p>Mesajınızı aldık ve en kısa sürede size dönüş yapacağız. Talep numaranız: <strong>${reference}</strong>.</p>
         <p>Özet:</p>
         <ul>
           <li><strong>Başlık:</strong> ${subject.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</li>
           <li><strong>Mesaj:</strong> ${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</li>
           ${phone ? `<li><strong>Telefon:</strong> ${phone}</li>` : ""}
           <li><strong>E-posta:</strong> ${email}</li>
         </ul>
         <p>İyi günler dileriz.<br/>Gümrük360</p>`
      : `<p>Hello,</p>
         <p>We have received your message and will get back to you as soon as possible. Your request ID is <strong>${reference}</strong>.</p>
         <p>Summary:</p>
         <ul>
           <li><strong>Subject:</strong> ${subject.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</li>
           <li><strong>Message:</strong> ${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</li>
           ${phone ? `<li><strong>Phone:</strong> ${phone}</li>` : ""}
           <li><strong>Email:</strong> ${email}</li>
         </ul>
         <p>Best regards,<br/>Easycustoms360</p>`;

    const commonText = locale.startsWith("tr")
      ? [
          "Merhaba",
          `Mesajınızı aldık. Talep No: ${reference}`,
          `Başlık: ${subject}`,
          `Mesaj: ${message}`,
          phone ? `Telefon: ${phone}` : "",
          `E-posta: ${email}`
        ].filter(Boolean).join("\n")
      : [
          "Hello",
          `We received your message. Ref: ${reference}`,
          `Subject: ${subject}`,
          `Message: ${message}`,
          phone ? `Phone: ${phone}` : "",
          `Email: ${email}`
        ].filter(Boolean).join("\n");

    // Attachments (used for both admin and user)
    const files = form.getAll("attachments") as File[];
    const attachments: { filename: string; content: any }[] = [];
    for (const f of files) {
      // Some browsers send an empty File entry even if no file selected — skip zero-sized or unnamed
      const anyF: any = f as any;
      if (!anyF || typeof anyF.name !== "string" || !anyF.name) continue;
      if (typeof anyF.size === "number" && anyF.size <= 0) continue;
      if (!("arrayBuffer" in anyF)) continue;
      const ab = await (anyF as File).arrayBuffer();
      const buf = Buffer.from(new Uint8Array(ab));
      if (buf.length === 0) continue;
      attachments.push({ filename: anyF.name, content: buf });
    }

    // --- Send to admins (same content)
    let adminRes: any = null;
    try {
      adminRes = await resend.emails.send({
        from,
        to: adminList,
        subject: commonSubject,
        html: commonHtml,
        text: commonText,
        attachments: attachments.length ? attachments : undefined, // pass Buffers directly
        replyTo: email,
        tags: [{ name: "kind", value: "contact_common" }]
      });
    } catch (err: any) {
      console.error("[contact] admin mail throw:", err?.message || err);
      adminRes = { error: String(err?.message || err) };
    }

    // --- Send to user (same content)
    let userRes: any = null;
    try {
      userRes = await resend.emails.send({
        from,
        to: [email],
        subject: commonSubject,
        html: commonHtml,
        text: commonText,
        attachments: attachments.length ? attachments : undefined,
        replyTo: email,
        tags: [{ name: "kind", value: "contact_common_user" }]
      });
    } catch (err: any) {
      console.error("[contact] user mail throw:", err?.message || err);
      userRes = { error: String(err?.message || err) };
    }

    const successMessage = locale.startsWith("tr")
      ? "Mesajınız alındı. Teşekkür ederiz! En geç bir iş günü içinde size dönüş yapacağız."
      : "Your message has been received. Thank you! We will get back to you within one business day.";

    const ok = !adminRes?.error && !userRes?.error;
    return NextResponse.json({
      ok,
      message: ok ? successMessage : "Mail gönderiminde bir sorun oluştu.",
      ref: reference,
      ids: { admin: adminRes?.data?.id, user: userRes?.data?.id },
      admins: adminList,
      errors: { admin: adminRes?.error, user: userRes?.error }
    }, { status: ok ? 200 : 500 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, message: "Unexpected error." }, { status: 500 });
  }
}
