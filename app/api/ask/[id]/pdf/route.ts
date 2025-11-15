export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import path from 'path'
import { promises as fs } from 'fs'
import { getTranslations } from "next-intl/server";
import type { PDFFont } from "pdf-lib";
import { resolveTenantCurrency, fxBaseTry, computeLockedFromTRY } from "@/lib/fx/resolveTenantCurrency";
/* ---------------- helpers ---------------- */
const s = (v: any) => (v == null ? '' : String(v))

const fmtMoney = (v: any, currency = 'TRY', localeTag: string = 'tr-TR') => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  return n.toLocaleString(localeTag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' ' + currency
}
function resolveLocale(req: Request) {
  const hdr = (req.headers.get("x-language") || req.headers.get("accept-language") || "").toLowerCase();
  if (hdr.startsWith("en")) return "en";
  if (hdr.includes("en")) return "en";
  return "tr";
}

function parseDate(v: any): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isFinite(+d) ? d : null
}
function numOrNull(v: any): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * SLA hedef teslimi SlaBox ile aynı mantıkta hesaplar:
 * 1) questions.sla_due_at
 * 2) questions.pricing.slaDueAt / sla_due_at
 * 3) created_at + (is_urgent ? est_days_urgent : est_days_normal)
 *    (gün alanları question’da yoksa pricing içindeki camelCase/snakes’ten dener)
 */
function computeDueAtFrom(q: any): Date | null {
  // (1) soru satırındaki SLA tarihi
  const byQuestion = parseDate(q?.sla_due_at)
  if (byQuestion) return byQuestion

  // (2) pricing JSON içinden
  const p = q?.pricing || {}
  const byPricing = parseDate(p?.slaDueAt) || parseDate(p?.sla_due_at)
  if (byPricing) return byPricing

  // (3) created_at + gün
  const created = parseDate(q?.created_at) || new Date()
  const urgent = !!(q?.is_urgent ?? p?.isUrgent ?? p?.urgent)

  const daysFromQ =
    urgent
      ? (numOrNull(q?.est_days_urgent))
      : (numOrNull(q?.est_days_normal))

  const daysFromP =
    urgent
      ? (numOrNull(p?.estDaysUrgent) ?? numOrNull(p?.est_days_urgent))
      : (numOrNull(p?.estDaysNormal) ?? numOrNull(p?.est_days_normal))

  const days = daysFromQ ?? daysFromP ?? 1
  return new Date(created.getTime() + days * 86400000)
}

async function loadUnicodeFont(): Promise<Uint8Array | null> {
  // Türkçe karakterler için Unicode TTF
  const candidates = [
    path.join(process.cwd(), 'public', 'fonts', 'NotoSans-Regular.ttf'),
    path.join(process.cwd(), 'public', 'NotoSans-Regular.ttf'),
  ]
  for (const p of candidates) {
    try {
      const buf = await fs.readFile(p)
      if (buf && buf.length > 0) return new Uint8Array(buf)
    } catch { /* try next */ }
  }
  return null
}

/* ---------------- handler ---------------- */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParamRaw } = await params

    const idParam = decodeURIComponent(String(idParamRaw || '')).trim()

    // 1) Soru → doğrudan question.id ile
    const { data: q0 } = await supabaseAdmin
      .from('questions')
      .select('*')
      .eq('id', idParam)
      .maybeSingle()

    // 2) Bulunamazsa order.id olabilir → order.question_id
    let q: any = q0
	const locale = resolveLocale(req);
const t = await getTranslations({ locale, namespace: "pdf" });
    if (!q) {
      const { data: ord, error: ordErr } = await supabaseAdmin
        .from('orders')
        .select('question_id')
        .eq('id', idParam)
        .maybeSingle()
      if (ordErr) {
        return NextResponse.json({ ok: false, display: t("errors.questionNotFound"), error: ordErr.message }, { status: 404 })
      }
      if (!ord?.question_id) {
        return NextResponse.json({ ok: false, display: t("errors.questionNotFound"), error: 'not_found' }, { status: 404 })
      }
      const { data: q2, error: qErr2 } = await supabaseAdmin
        .from('questions')
        .select('*')
        .eq('id', ord.question_id)
        .maybeSingle()
      if (qErr2 || !q2) {
        return NextResponse.json({ ok: false, display: t("errors.questionNotFound"), error: qErr2?.message || 'not_found' }, { status: 404 })
      }
     q = q2
   }

   // Tenant bazlı para birimi & multiplier
   let displayCurrency = "TRY";
   let pricingMultiplier = 1;
    try {
    const host = req.headers.get("host") || undefined;
    const resolved = await resolveTenantCurrency({
     userId: q.user_id,
       host,
     });
    displayCurrency = (resolved?.currency ?? "TRY").toUpperCase();
    pricingMultiplier = Number(resolved?.pricing_multiplier ?? 1) || 1;
  } catch {}

 // Para birimi (tenant bazlı gösterim için)
   const currency =
     displayCurrency ||
      (q?.pricing?.currency) ||
     q?.currency ||
    'TRY'

   // --------- PDF oluştur ---------
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib')
    const fontkit = (await import('@pdf-lib/fontkit')).default
    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)

    // Font
    let font: PDFFont
    const fontBytes = await loadUnicodeFont()
    if (fontBytes) {
      font = await pdf.embedFont(fontBytes, { subset: false })
    } else {
      font = await pdf.embedFont(StandardFonts.Helvetica)
    }

    // Sayfa ölçüleri (A4)
    let page = pdf.addPage([595.28, 841.89])
    const margin = 36
    const innerW = page.getWidth() - margin * 2
    let y = page.getHeight() - margin

    // Basit sarma (wrap) yardımcıları
    function linesFor(text: string, size = 11, maxWidth = innerW) {
      const words = String(text || '').split(/\s+/)
      const lines: string[] = []
      let line = ''
      for (const w of words) {
        const test = (line ? (line + ' ' + w) : w)
        const wpx = font.widthOfTextAtSize(test, size)
        if (wpx <= maxWidth) {
          line = test
        } else {
          if (line) lines.push(line)
          line = w
        }
      }
      if (line) lines.push(line)
      return lines
    }
    function drawParagraph(text: string, size = 11, color = rgb(0,0,0), x = margin, maxWidth = innerW) {
      for (const ln of linesFor(text, size, maxWidth)) {
        page.drawText(ln, { x, y: y - size, size, font, color })
        y -= (size + 4)
      }
    }
    function drawHeading(text: string, size = 12, color = rgb(0.05,0.25,0.6)) {
      // pseudo-bold: aynı konuma küçük ofsetle iki kez yaz
      const t = String(text || '')
      page.drawText(t, { x: margin, y: y - size, size, font, color })
      page.drawText(t, { x: margin+0.2, y: y - size, size, font, color })
      y -= (size + 8)
    }
    function drawKeyValue(key: string, val: string, size = 11) {
      const k = String(key || '')
      const v = String(val || '')
      const keyW = font.widthOfTextAtSize(k, size)
      page.drawText(k, { x: margin, y: y - size, size, font, color: rgb(0.15,0.15,0.15) })
      drawParagraph(v, size, rgb(0,0,0), margin + keyW + 8, innerW - keyW - 8)
    }

    // ÇERÇEVE — mavi
    page.drawRectangle({
      x: margin - 6,
      y: margin - 6,
      width: page.getWidth() - (margin - 6) * 2,
      height: page.getHeight() - (margin - 6) * 2,
      borderColor: rgb(0.20, 0.40, 0.80),
      borderWidth: 1.5,
    })

    // Başlık
    const title = t("title.offer")
    const titleSize = 16
    const titleWidth = font.widthOfTextAtSize(title, titleSize)
    page.drawText(title, {
      x: margin + (innerW - titleWidth) / 2,
      y: y - titleSize,
      size: titleSize,
      font,
      color: rgb(0.05, 0.25, 0.6),
    })
    // pseudo-bold başlık
    page.drawText(title, {
      x: margin + (innerW - titleWidth) / 2 + 0.3,
      y: y - titleSize,
      size: titleSize,
      font,
      color: rgb(0.05, 0.25, 0.6),
    })
    y -= (titleSize + 16)

    // Genel bilgiler
    drawKeyValue(t("kv.questionId"), s(q.id))
    if (q.created_at) drawKeyValue(t("kv.createdAt"), new Date(q.created_at).toLocaleString(locale === "en" ? "en-GB" : "tr-TR"))
    drawKeyValue(t("kv.title"), s(q.title) || '—')

    // Seçilen danışman
    try {
      const assignedTo = (q as any)?.assigned_to as string | null
      let consultant = ''
      if (assignedTo) {
        const { data: w } = await supabaseAdmin
          .from('worker_cv_profiles')
          .select('display_name')
          .eq('worker_user_id', assignedTo)
          .maybeSingle()
        consultant = (w as any)?.display_name || ''
      }
      drawKeyValue(
  t("kv.assignedConsultant"),
  consultant && consultant.trim() ? consultant : t("kv.teamDefault")
)
    } catch {}
    // (kaldırıldı) Para Birimi satırı
    // drawKeyValue('Para Birimi:', String(currency))
    if (q.is_urgent) drawKeyValue(t("kv.urgency"), t("kv.urgent"))

    // Teslim bilgisi — sadece seçili (normal/acil)
    {
      const estNormal = Number((q as any)?.est_days_normal ?? 1)
      const estUrgent = Number((q as any)?.est_days_urgent ?? estNormal)
      const selectedDays = q.is_urgent ? estUrgent : estNormal
      const teslimDate = q.sla_due_at
        ? new Date(q.sla_due_at).toLocaleString(locale === "en" ? "en-GB" : "tr-TR")
        : (q.created_at
               ? new Date(new Date(q.created_at).getTime() + Number(selectedDays) * 86400000)
                   .toLocaleString(locale === "en" ? "en-GB" : "tr-TR")
				   : "-")
       
       drawKeyValue(t("kv.deliveryDate"), teslimDate)
    }

   // Ücret bilgisi
    {
    const priceBase = Number(q.price_final_tl ?? q.price_tl ?? (q.pricing?.price ?? 0))
     let displayAmount = priceBase
     if (currency !== "TRY") {
       try {
        const { rate } = await fxBaseTry(currency)
         if (Number.isFinite(rate) && rate > 0) {
          displayAmount = computeLockedFromTRY({
             tryAmount: priceBase,
            baseCurrency: currency,
              fxRateBaseTry: rate,
              multiplier: pricingMultiplier,
            })
        }
      } catch {}
     }
    drawKeyValue(
       t("kv.offerAmount"),
       fmtMoney(displayAmount, String(currency), (locale === "en" ? "en-GB" : "tr-TR"))
     )

   // Kredi bilgisi (subscription_settings'ten)

     try {
       const { data: ss } = await supabaseAdmin
         .from('subscription_settings')
        .select('credit_price_lira, credit_discount_user, credit_discount_org')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
      const creditPrice = Number(ss?.credit_price_lira ?? 1);
         // Kurumsal mı? (soru sahibinin aktif organizasyon üyeliği var mı)
      let isCorporate = false;
        try {
           const { data: memRows } = await supabaseAdmin
           .from('organization_members')
           .select('org_id')
          .eq('user_id', q.user_id)
          .eq('status', 'active')
           .limit(1);
         isCorporate = Array.isArray(memRows) && memRows.length > 0;
      } catch {}

        const rawDiscount = isCorporate
          ? Number(ss?.credit_discount_org ?? 0)
          : Number(ss?.credit_discount_user ?? 0);
        const discountFrac = rawDiscount > 1 ? (rawDiscount / 100) : rawDiscount;
        const baseForCredit = priceBase * (1 - discountFrac);
       const creditsBase = baseForCredit / (creditPrice || 1);
      const credits = Math.max(0, Math.round(creditsBase * pricingMultiplier));
        const advPct = Math.round((rawDiscount > 1 ? rawDiscount : rawDiscount * 100));
        drawKeyValue(
          t("kv.creditAmount"),
          t("kv.creditLine", { credits, pct: advPct })
        );

      } catch {}
    }
 
    y -= 6
  page.drawLine({

      start: { x: margin, y },
      end: { x: margin + innerW, y },
      color: rgb(0.85,0.85,0.90),
      thickness: 0.8
    })
    y -= 10

    // Kapsam
     drawHeading(t("sections.scope.heading"))
    // Giriş cümlesi
     drawParagraph(t("sections.scope.intro"))
    // Adım 1
    drawHeading(t("sections.scope.step1"))
    drawParagraph(t("sections.scope.step1_body"))
    drawParagraph(t("sections.scope.step1_note"))
   // Adım 2
    drawHeading(t("sections.scope.step2"))
    drawParagraph(t("sections.scope.step2_body"))

    // Teslim Şekli
    drawHeading(t("sections.delivery.heading"))
   drawParagraph(t("sections.delivery.present"))
     drawParagraph(t("sections.delivery.time"))
    drawParagraph(t("sections.delivery.revision"))
 


    // Şartlar
    drawHeading(t("sections.terms.heading"))
    const bullets = [
       t("sections.terms.b1"),
      t("sections.terms.b2"),
     t("sections.terms.b3"),
      t("sections.terms.b4"),
       t("sections.terms.b5"),
     t("sections.terms.b6"),
     t("sections.terms.b7"),
    ]
    for (const b of bullets) {
      const mark = '• '
      const size = 10.5
      // satır sarmalı maddeler
      const lines = linesFor(b, size, innerW - 14)
      page.drawText(mark, { x: margin, y: y - size, size, font, color: rgb(0,0,0) })
      page.drawText(lines[0] || '', { x: margin + 12, y: y - size, size, font, color: rgb(0,0,0) })
      y -= (size + 4)
      for (let i = 1; i < lines.length; i++) {
        page.drawText(lines[i], { x: margin + 12, y: y - size, size, font, color: rgb(0,0,0) })
        y -= (size + 4)
      }
        if (y < margin + 120) { // basit sayfa kırımı
      page = pdf.addPage([595.28, 841.89])
     y = page.getHeight() - margin
   }
    }

    y -= 6
    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + innerW, y },
      color: rgb(0.85,0.85,0.90),
      thickness: 0.8
    })
    y -= 10

    // Onay
    drawHeading(t("sections.approval.heading"))
    drawParagraph(t("sections.approval.body"))
    // PDF çıktı
    const bytes = await pdf.save()
	const fileName = locale === "en" ? `offer-${q.id}.pdf` : `teklif-${q.id}.pdf`;
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-store',
		'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err: any) {
   const msg = String(err?.message || err)
     try {
      const locale = resolveLocale(req);
     const tt = await getTranslations({ locale, namespace: "pdf" });
      return NextResponse.json({ ok: false, display: tt("errors.pdfFailed"), error: msg }, { status: 500 })
  } catch {
      // Çeviri alınamazsa güvenli bir TR fallback dön
     return NextResponse.json({ ok: false, display: "PDF oluşturulamadı", error: msg }, { status: 500 })
    }
  }
}
