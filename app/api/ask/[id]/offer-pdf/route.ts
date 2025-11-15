export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/serverAdmin'
import path from 'path'
import { promises as fs } from 'fs'
import { BRAND } from "@/lib/config/appEnv"
/* ---------------- helpers ---------------- */
const s = (v: any) => (v == null ? '' : String(v))

const fmtMoney = (v: any, currency = 'TRY') => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  return n.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' ' + currency
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
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    if (!q) {
      const { data: ord, error: ordErr } = await supabaseAdmin
        .from('orders')
        .select('question_id')
        .eq('id', idParam)
        .maybeSingle()
      if (ordErr) {
        return NextResponse.json({ ok: false, display: 'question_not_found', error: ordErr.message }, { status: 404 })
      }
      if (!ord?.question_id) {
        return NextResponse.json({ ok: false, display: 'question_not_found', error: 'not_found' }, { status: 404 })
      }
      const { data: q2, error: qErr2 } = await supabaseAdmin
        .from('questions')
        .select('*')
        .eq('id', ord.question_id)
        .maybeSingle()
      if (qErr2 || !q2) {
        return NextResponse.json({ ok: false, display: 'question_not_found', error: qErr2?.message || 'not_found' }, { status: 404 })
      }
      q = q2
    }

    // Para birimi
    const currency =
      (q?.pricing?.currency) ||
      q?.currency ||
      'TRY'

    // --------- PDF oluştur ---------
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib')
    const fontkit = (await import('@pdf-lib/fontkit')).default

    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)

    let font
    const fontBytes = await loadUnicodeFont()
    if (fontBytes) {
      font = await pdf.embedFont(fontBytes, { subset: false })
    } else {
      // Uyarı: Bu font Türkçe karakterlerde eksik olabilir.
      font = await pdf.embedFont(StandardFonts.Helvetica)
    }

    const page = pdf.addPage([595.28, 841.89]) // A4 portrait
    const margin = 40
    const maxW = page.getWidth() - 2 * margin
    let y = page.getHeight() - margin

    const drawH1 = (t: string) => { page.drawText(t, { x: margin, y, size: 18, font }); y -= 28 }
    const drawH2 = (t: string) => { page.drawText(t, { x: margin, y, size: 14, font }); y -= 22 }
    const drawKV = (k: string, v: string) => { page.drawText(`${k}: ${v}`, { x: margin, y, size: 11, font }); y -= 16 }
    const hr = () => {
      y -= 8
      page.drawLine({
        start: { x: margin, y },
        end: { x: page.getWidth() - margin, y },
        thickness: 0.5, color: rgb(0.75, 0.75, 0.75)
      })
      y -= 10
    }
    const drawPara = (txt: string) => {
      const size = 11
      if (!txt) return
      const words = String(txt).split(/\s+/g)
      let line = ''
      const flush = (l: string) => { page.drawText(l, { x: margin, y, size, font }); y -= 16 }
      for (const w of words) {
        const test = line ? line + ' ' + w : w
        const width = font.widthOfTextAtSize(test, size)
        if (width <= maxW) line = test
        else { if (line) flush(line); line = w }
      }
      if (line) flush(line)
      y -= 4
    }

    // Başlık ve genel bilgiler
    drawH1('SLA • Fiyatlandırma Sonucu')
    drawKV('Soru ID', s(q.id))
    if (q.created_at) drawKV('Oluşturma', new Date(q.created_at).toLocaleString('tr-TR'))
    hr()
    if (s(q.title)) drawKV('Başlık', s(q.title))
    if (s(q.description)) drawPara(s(q.description))
    hr()

    // Fiyatlama bölümü
    drawH2('Fiyatlama sonucu')

    // (İSTEK ÜZERİNE) — "Soru/Fiyat skoru" satırı GÖSTERİLMEZ
    // if (qScore != null) drawKV('Soru skoru', String(qScore))

    // Acil durumu
    drawKV('Acil', q.is_urgent ? 'Evet' : 'Hayır')

    // Ücret bilgisi (questions.pricing.priceFinal -> yoksa question.price_*)
    const priceFinal =
      (q?.pricing?.priceFinal) ??
      (q?.pricing?.price_final) ??
      q?.price_final_tl ??
      q?.price_tl
    if (priceFinal != null) drawKV('Ücret', fmtMoney(priceFinal, currency))

    // Hedef teslim — SlaBox ile aynı mantık
    // Seçilen danışman ad-soyadını 'Hedef teslim' satırının hemen altına yazdır
let __consultantName: string | undefined = undefined
try {
  const assignedTo = (q as any)?.assigned_to as string | null
  if (assignedTo) {
    const { data: __w } = await supabaseAdmin
      .from('worker_cv_profiles')
      .select('display_name')
      .eq('worker_user_id', assignedTo)
      .maybeSingle()
    __consultantName = (__w as any)?.display_name || undefined
  }
} catch {}
    // Seçilen danışman (yoksa Gümrük360 Ekibi)
    try {
      const __disp = (__consultantName && __consultantName.trim()) ? __consultantName : `${BRAND.nameTR} Ekibi`;
      drawKV('Seçilen danışman', __disp)
    } catch {}

const __consultantFinal =
  (__consultantName && __consultantName.trim())
    ? __consultantName
    : `${BRAND.nameTR} Ekibi`;
    drawKV('Seçilen danışman', __consultantFinal)
if (__consultantName) drawKV('Seçilen danışman', __consultantName)

    // PDF çıktı
    const bytes = await pdf.save()
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="proposal-${q.id}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    const msg = String(err?.message || err)
    return NextResponse.json({ ok: false, display: 'pdf_generate_failed', error: msg }, { status: 500 })
  }
}
