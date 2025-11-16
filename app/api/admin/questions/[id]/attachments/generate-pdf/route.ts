// app/api/admin/questions/[id]/attachments/generate-pdf/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import { promises as fs } from 'fs'
import { APP_DOMAINS, BRAND } from "@/lib/config/appEnv"
/* ---------- Supabase admin (inline) ---------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const supabaseAdmin = createClient(SUPABASE_URL!, SERVICE_ROLE!, { auth: { persistSession: false }})

/* ---------- helpers ---------- */
const asDateStamp = (d = new Date()) => {
  const p = (n:number)=> String(n).padStart(2,'0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
}
const stripHtml = (html?: string|null) => {
  if (!html) return ''
  return String(html).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
}
function removeSections(md: string, sectionTitles: string[]){
  let out = md
  for (const title of sectionTitles){
    const re = new RegExp(`^##\s*${title}[^\n]*[\s\S]*?(?=^#|^##|^$)`, 'gmi')
    out = out.replace(re, '').trim()
  }
  return out
}
async function loadFontCandidate(names: string[]): Promise<Uint8Array | null> {
  for (const name of names){
    const candidates = [
      path.join(process.cwd(), 'public', 'fonts', name),
      path.join(process.cwd(), 'public', name),
    ]
    for (const p of candidates){
      try{
        const buf = await fs.readFile(p)
        if (buf && buf.length > 0) return new Uint8Array(buf)
      } catch {}
    }
  }
  return null
}
async function loadUnicodeFont(): Promise<Uint8Array | null> {
  return loadFontCandidate(['NotoSans-Regular.ttf', 'NotoSans.ttf'])
}
async function loadBoldFont(): Promise<Uint8Array | null> {
  return loadFontCandidate(['NotoSans-Bold.ttf', 'NotoSans-SemiBold.ttf'])
}

async function fetchLatestAnswer(questionId: string){
   const rev = await supabaseAdmin
     .from('revisions')
     .select('revision_no, content_html, content, created_at')
     .eq('question_id', questionId)
     .order('created_at', { ascending: false })
     .limit(1)
     .maybeSingle()

  

  const dr = await supabaseAdmin
    .from('answer_drafts')
    .select('version, content_html, content, created_at')
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const r = rev.data
   const d = dr.data
   if (r && d) return (new Date(r.created_at) > new Date(d.created_at)) ? { source: 'revision', ...r } : { source: 'draft', ...d }
   if (r) return { source: 'revision', ...r }
   if (d) return { source: 'draft', ...d }
   return null
}

type Para = { text: string, kind: 'h1'|'h2'|'h3'|'p' }
function mdToParas(md: string): Para[] {
  const lines = md.split(/\r?\n/)
  const out: Para[] = []
  for (const raw of lines){
    const line = raw.trimRight()
    if (!line.trim()){ out.push({ text: '', kind: 'p' }); continue }
    if (line.startsWith('### ')) out.push({ text: line.replace(/^###\s+/, ''), kind: 'h3' })
    else if (line.startsWith('## ')) out.push({ text: line.replace(/^##\s+/, ''), kind: 'h2' })
    else if (line.startsWith('# ')) out.push({ text: line.replace(/^#\s+/, ''), kind: 'h1' })
    else out.push({ text: line, kind: 'p' })
  }
  return out
}
 // Soru sahibinin tenant'ına göre logo data URL'i + primary_domain'i üretir
 async function resolveTenantLogoData(questionId: string): Promise<{ logoDataUrl: string | null; primaryDomain: string | null }> {
   let primaryDomain: string | null = null
  let logoDataUrl: string | null = null
   try {
    // 1) Soruyu soran kullanıcıyı bul
    const { data: qRow, error: qErr } = await supabaseAdmin
     .from('questions')
     .select('user_id')
     .eq('id', questionId)
      .maybeSingle()
   if (qErr || !qRow?.user_id) return { logoDataUrl, primaryDomain }
    const userId = qRow.user_id as string

   // 2) profiles.tenant_key
    const { data: prof, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('tenant_key')
    .eq('id', userId)
      .maybeSingle()
    if (pErr) return { logoDataUrl, primaryDomain }
    const tenantCode = (prof as any)?.tenant_key as string | null
    if (!tenantCode) return { logoDataUrl, primaryDomain }

   // 3) tenants.primary_domain
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from('tenants')
      .select('primary_domain')
     .eq('code', tenantCode)
    .maybeSingle()
    if (tErr) return { logoDataUrl, primaryDomain }
    primaryDomain = (tenant as any)?.primary_domain as string | null
    if (!primaryDomain) return { logoDataUrl, primaryDomain }

   // 4) primary_domain → logo path
    let relPath: string | null = null
    if (primaryDomain === 'gumruk360.com') {
     relPath = path.join('brand', 'gumruk360bl-opt.svg')
    } else if (primaryDomain === 'tr.easycustoms360.com') {
      relPath = path.join('brand', 'easycustoms360bl-opt.svg')
   }

    // 5) public altından SVG oku, data URL üret
  if (relPath) {
     const fullPath = path.join(process.cwd(), 'public', relPath)
     const svg = await fs.readFile(fullPath, 'utf8')
     const encoded = encodeURIComponent(svg)
     logoDataUrl = `data:image/svg+xml;utf8,${encoded}`
    }

   return { logoDataUrl, primaryDomain }
  } catch {
    return { logoDataUrl: null, primaryDomain: null }
 }
 }

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }){
  try{
    const { id } = await ctx.params
    const questionId = id
    if (!questionId) return NextResponse.json({ ok:false, error:'missing id' }, { status: 400 })

// Dil tespiti: ?lang=en ise EN, host easycustoms360 içeriyorsa EN, aksi TR
      const url = new URL(req.url)
   const host = url.hostname.toLowerCase()
   const langQ = (url.searchParams.get('lang') || '').toLowerCase()
 const enDomain = APP_DOMAINS.en
  const isEN = langQ.startsWith('en') || (!!enDomain && host.endsWith(enDomain))
    const latest = await fetchLatestAnswer(questionId)
   const { logoDataUrl, primaryDomain } = await resolveTenantLogoData(questionId)
   const isTenantENDomain = primaryDomain === 'tr.easycustoms360.com'
   const isTenantTRDomain = primaryDomain === 'gumruk360.com'
   const effectiveIsEN = isTenantENDomain ? true : (isTenantTRDomain ? false : isEN)

 
   if (!latest) return NextResponse.json({ ok:false, error:'İçerik bulunamadı (revizyon/taslak yok).' }, { status: 404 })

      // ---- HTML'den PDF üret (biçimlendirme korunur) ----
    // 1) İçerik HTML'ini hazırla (öncelik: content_html)
    const ensureHtml = (txt: string) =>
      `<p>${String(txt || '').trim()
          .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/\n{2,}/g,'</p><p>').replace(/\n/g,'<br/>')}</p>`

    const bodyHtml =
      (latest as any).content_html && String((latest as any).content_html).trim().length > 0
        ? String((latest as any).content_html)
        : ((latest as any).content_md && String((latest as any).content_md).trim().length > 0
            ? ensureHtml(String((latest as any).content_md)) // basit fallback
            : ensureHtml(String((latest as any).content || '')))

   // 2) Basit bir HTML şablonu (A4, kenar boşlukları, başlık)
   
    const titleTxt = effectiveIsEN ? `${BRAND.nameEN} Opinion Letter` : `${BRAND.nameTR} Görüşü`;
    const dateTxt  = asDateStamp()
  const logoHtml = logoDataUrl
     ? `<img src="${logoDataUrl}" alt="Logo" style="max-width:160px;width:100%;height:auto;" />`
      : 'LOGO';

   const htmlDoc = `<!doctype html>

<html lang="${isEN ? 'en' : 'tr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  @page { size: A4; margin: 20mm 15mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', Arial, sans-serif; color:#111; }
  header { border-bottom: 2px solid #1361c7; padding: 0 0 8px 0; margin-bottom: 18px; display:flex; align-items:center; gap:16px; }
  header .logo { width:160px; display:flex; align-items:center; justify-content:center; font-size:12px; color:#1361c7; }
  header .meta { margin-left:auto; text-align:right; font-size:12px; color:#1361c7; }
  h1 { font-size:18px; margin:0; }
  .content { font-size:13.5px; line-height:1.5; }
  .content h1, .content h2, .content h3 { margin: 16px 0 8px; }
  .content p { margin: 0 0 10px; }
  .content ul, .content ol { margin: 8px 0 12px 20px; }
  .content table { border-collapse: collapse; width:100%; margin:12px 0; }
  .content th, .content td { border:1px solid #ddd; padding:6px 8px; }
  .content blockquote { border-left: 3px solid #ddd; margin: 8px 0; padding: 6px 10px; color:#444; }
  /* sayfa kırılımı için: <div style="page-break-after:always"></div> kullanılabilir */
</style>
</head>
<body>
  <header>
    <div class="logo">${logoHtml}</div>
   <div>
   <h1>${titleTxt}</h1>
    </div>
    <div class="meta">${dateTxt}</div>
  </header>
  <main class="content">
    ${bodyHtml}
  </main>
</body>
</html>`;

const useCore = process.env.USE_CHROMIUM_CORE === '1' || process.env.VERCEL === '1'
let puppeteer: any = null
let chromium: any = null

if (useCore) {
  const pCore = await import('puppeteer-core')
  const ch = await import('@sparticuz/chromium')

  // default export varsa onu kullan, yoksa modülün kendisini
  puppeteer = (pCore as any).default ?? pCore
  chromium = (ch as any).default ?? ch
} else {
  const p = await import('puppeteer')
  puppeteer = (p as any).default ?? p
}


    // Windows/yerel: PUPPETEER_EXECUTABLE_PATH verilmişse onu kullan (kurulu Chrome)
const localChrome = process.env.PUPPETEER_EXECUTABLE_PATH // ör: C:\Program Files\Google\Chrome\Application\chrome.exe

let browser: any
if (useCore) {
  // Serverless / Vercel gibi ortamlarda
  const execPath = await chromium.executablePath()
  browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: execPath,
    headless: chromium.headless,
  })
} else if (localChrome) {
  // Yerelde kurulu Chrome ile başlat
  browser = await puppeteer.launch({
    executablePath: localChrome,
    headless: 'new' as any,
    args: ['--no-sandbox','--disable-setuid-sandbox'],
  })
} else {
  // Yerelde puppeteer'ın indirdiği Chromium ile
  browser = await puppeteer.launch({
    headless: 'new' as any,
    args: ['--no-sandbox','--disable-setuid-sandbox'],
  })
}

    const page = await browser.newPage()
    await page.setContent(htmlDoc, { waitUntil: 'networkidle0' })
    const bytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
    })
    await browser.close()

    // --------- Upload (bucket: attachments, path: {id}/answers/...) ---------
   const filenameDownload = `${effectiveIsEN ? (BRAND.nameEN + ' Opinion Letter - ') : (BRAND.nameTR + ' Görüş Yazısı - ')}${asDateStamp()}.pdf`;
   const filenamePath = (effectiveIsEN ? 'Opinion_Letter_' : 'Gorus_Yazisi_') + asDateStamp() + '.pdf'
    const storagePath = `${questionId}/answers/${filenamePath}`

    const up = await supabaseAdmin
      .storage
      .from('attachments')
      .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true })
    if (up.error) return NextResponse.json({ ok:false, error: up.error.message }, { status: 500 })

    const signed = await supabaseAdmin.storage.from('attachments').createSignedUrl(storagePath, 60*5)
    const signedUrl = (signed as any)?.data?.signedUrl || null

    // audit
    try{
      await supabaseAdmin.from('audit_logs').insert({
        action: 'answer_pdf_created',
        resource: 'attachments',
        resource_id: storagePath,
        meta: { question_id: questionId, version: (latest as any)?.version || null, source: (latest as any)?.source || null }
      } as any)
    } catch {}

    return NextResponse.json({ ok:true, data: { path: storagePath, url: signedUrl, filename: filenameDownload } })
  } catch (e:any){
    
    return NextResponse.json({ ok:false, error: e?.message || 'unknown error' }, { status: 500 })
  }
}
