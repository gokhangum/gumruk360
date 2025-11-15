// app/admin/request/[id]/EditorPanel.tsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Editor from './Editor'
import DraftActionButtons from './DraftActionButtons'
import SendModal from './SendModal'
import AttachmentUploader from './AttachmentUploader'
import { useTranslations, useLocale } from "next-intl"
const BRAND = { nameTR: "Gümrük360", nameEN: "EasyCustoms360" };

type Props = {
  questionId: string
  adminEmail: string
  title: string
  description: string
  initialContent: string
  latestVersion: number
  basePath?: '/admin/request' | '/worker/editor'
}

type ApiOk<T> = { ok: true; data: T }
type ApiErr = { ok: false; error?: string; display?: string }

// Basit PDF üretici (tek sayfa, A4). Helvetica font, üstte antet ve marka metni.
function buildOpinionPdfBytes(opts: { title: string, org: string, subtitle: string, body: string }) : Uint8Array {
  const { title, org, subtitle, body } = opts
  const w = 595, h = 842 // A4
  function pdfStr(s: string){ return '(' + s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/\r?\n/g,'\\r') + ')' }
  const lines = body.split(/\r?\n/)
  function wrapLine(s: string, max=90){
    const out: string[] = []
    let cur = ''
    for (const tok of s.split(/\s+/)){
      if ((cur + ' ' + tok).trim().length > max){
        if (cur) out.push(cur)
        cur = tok
      } else {
        cur = (cur ? cur + ' ' : '') + tok
      }
    }
    if (cur) out.push(cur)
    return out
  }
  const content: string[] = []
  content.push('q')
  content.push('0.95 0.97 1 rg 0 800 595 42 re f')
  content.push('0.75 0.78 0.95 RG 0 798 m 595 798 l S')
  content.push('0.20 0.35 0.70 rg 24 806 32 24 re f')
  content.push('BT /F1 12 Tf 1 0 0 1 64 824 Tm 0 0 0 rg ' + pdfStr(org) + ' Tj ET')
  content.push('BT /F1 18 Tf 1 0 0 1 24 760 Tm 0 0 0 rg ' + pdfStr(title) + ' Tj ET')
  content.push('BT /F1 11 Tf 1 0 0 1 24 740 Tm 0 0 0 rg ' + pdfStr(subtitle) + ' Tj ET')
  let y = 720
  for (const L of lines){
    const parts = wrapLine(L, 95)
    for (const p of parts){
      if (y < 60) break
      content.push('BT /F1 11 Tf 1 0 0 1 24 ' + y + ' Tm 0 0 0 rg ' + pdfStr(p) + ' Tj ET')
      y -= 16
    }
    y -= 4
    if (y < 60) break
  }
  content.push('Q')
  const contentStream = content.join('\n')
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'
  const obj3 = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + '] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n'
  const obj4 = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  const obj5 = '5 0 obj\n<< /Length ' + contentStream.length + ' >>\nstream\n' + contentStream + '\nendstream\nendobj\n'
  const header = '%PDF-1.4\n'
  const chunks = [header, obj1, obj2, obj3, obj4, obj5]
  const offsets: number[] = []
  let pdf = ''
  for (const ch of chunks){
    offsets.push(pdf.length)
    pdf += ch
  }
  const xrefOffset = pdf.length
  let xref = 'xref\n0 6\n0000000000 65535 f \n'
  for (const off of offsets){
    xref += (off.toString().padStart(10,'0') + ' 00000 n \n')
  }
  const trailer = 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF'
  const finalStr = pdf + xref + trailer
  const bytes = new TextEncoder().encode(finalStr)
  return bytes
}


// Doğru endpointler (App Router)
// run:       app/api/admin/gpt-answers/run        → client: /api/admin/gpt-answers/run
// summarize: app/api/admin/gpt-answers/summarize  → client: /api/admin/gpt-answers/summarize
const DRAFT_MODULE_RUN_ENDPOINT = '/api/admin/gpt-answers/run'
const DRAFT_MODULE_SUMMARY_ENDPOINT = '/api/admin/gpt-answers/summarize'

// Stil sabiti (taslak-modülü iki seçenekten biri; burada "teknik" ile sabitliyoruz)
const DEFAULT_STYLE: 'teknik' | 'resmi' = 'teknik'


function getCurrentLang(): 'tr'|'en' {
  try {
    const qs = typeof window !== 'undefined' ? window.location.search : ''
    const sp = new URLSearchParams(qs || '')
    const l = (sp.get('force_lang') || sp.get('lang') || '').toLowerCase()
    return l === 'en' ? 'en' : 'tr'
  } catch { return 'tr' as const }
}
export default function EditorPanel({
  questionId,
  adminEmail,
  title,
  description,
  initialContent,
  latestVersion,
  basePath,
}: Props) {
  const [content, setContent] = useState<string>(initialContent || '')
  const [loading, setLoading] = useState<boolean>(false)
  const [banner, setBanner] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null)

  const [busyRunTR, setBusyRunTR] = useState<boolean>(false)
  const [busyRunEN, setBusyRunEN] = useState<boolean>(false)
  const [busySave, setBusySave] = useState<boolean>(false)
  const [busySumm, setBusySumm] = useState<boolean>(false)
  const [busyPdf, setBusyPdf] = useState<boolean>(false)
const locale = (useLocale() as 'tr' | 'en')
const t = useTranslations('admin.request.editor')
const labelReviseDone = t('buttons.reviseDone').toLowerCase()
  // Editörden gelen içerik yayınını dinle (Editor.tsx → editor:content)
  useEffect(() => {
    const onText = (e: Event) => setContent(String((e as CustomEvent).detail ?? ''))
    window.addEventListener('editor:content', onText as any)
    return () => window.removeEventListener('editor:content', onText as any)
  }, [])

  const qsEmail = useMemo(
    () => (adminEmail ? `?email=${encodeURIComponent(adminEmail)}` : ''),
    [adminEmail]
  )

  // Worker/Admin baz yolunu belirle
  const [currentBase, setCurrentBase] = useState<string>(basePath || '/admin/request')
  useEffect(() => {
    if (basePath) {
      setCurrentBase(basePath)
      return
    }
    if (typeof window !== 'undefined') {
      const p = window.location.pathname
      if (p.startsWith('/worker/editor/')) setCurrentBase('/worker/editor')
      else setCurrentBase('/admin/request')
    }
  }, [basePath])

  // Feature flag (worker messaging)
  const [workerMessagingEnabled, setWorkerMessagingEnabled] = useState<boolean | null>(null)
  const [revizeInfo, setRevizeInfo] = useState<string>('')

  // Revize tamamlandı: alttaki gerçek butonu tetikle ve mesajı al
  function triggerReviseCompleteClick() {
    try {
      const root = document.querySelector('[data-draft-actions]')
      if (!root) { alert(t('errors.noReviseActions')); return }
      setRevizeInfo('')
      const observer = new MutationObserver(() => {
        try {
          const txt = (root as HTMLElement).textContent || ''
          const m = txt.match(/✓\s*Kaydedildi[^\n]*/i)
          if (m) { setRevizeInfo(m[0].trim()); observer.disconnect() }
        } catch {}
      })
      observer.observe(root, { childList: true, subtree: true, characterData: true })
      const btns = Array.from(root.querySelectorAll('button'))
      const target = btns.find(b => (b.textContent || '').toLowerCase().includes(labelReviseDone))
      if (target) { (target as HTMLButtonElement).click() } else { alert(t('revise.doneButtonNotFound')) }
      setTimeout(()=>{ try { observer.disconnect() } catch {} }, 5000)
    } catch (e) { }
  }

  // Alt kısımdaki "Revize tamamlandı" butonunu gizle
  useEffect(() => {
    try {
      const root = document.querySelector('[data-draft-actions]')
      if (!root) return
      const btns = Array.from(root.querySelectorAll('button'))
      const target = btns.find(b => (b.textContent || '').toLowerCase().includes(labelReviseDone))
      if (target) (target as HTMLButtonElement).style.display = 'none'
    } catch {}
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (currentBase !== '/worker/editor') {
        setWorkerMessagingEnabled(true)
        return
      }
    try {
      const r = await fetch('/api/feature-flags', { cache: 'no-store' })
     const j = await r.json()
       if (!alive) return
      const enabled = Boolean(j?.workerMessagingEnabled ?? true)
        setWorkerMessagingEnabled(enabled)
     } catch {

        if (!alive) return
        setWorkerMessagingEnabled(true)
      }
    })()
    return () => { alive = false }
  }, [currentBase])

  // Editörün güncel metnini köprü textarea’dan oku (garanti)
  function readEditorText(): string {
    const el = document.querySelector<HTMLTextAreaElement>('[data-editor-content]')
    if (el) return el.value
    return content || ''
  }


  // Editörün güncel HTML'ini köprü textarea’dan oku
  function readEditorHtml(): string {
    const el = document.querySelector<HTMLTextAreaElement>('[data-editor-content-html]')
    if (el) return el.value
    return ''
  }

  // Taslağı Kaydet
  async function handleSaveDraft() {
    if (busySave) return
    setBusySave(true)
    setBanner(null)
    try {
      const current = (readEditorText() || '').trim()
      if (!current) {
        setBanner({ type: 'error', text: t('draft.empty') })
        setBusySave(false)
        return
      }

      const res = await fetch(`/api/admin/questions/${questionId}/drafts${qsEmail}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: current, content_html: readEditorHtml() }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({} as any))) as ApiErr
        const msg = j?.display || j?.error || t('draft.saveFailed')
        setBanner({ type: 'error', text: msg })
        setBusySave(false)
        return
      }

     setBanner({ type: 'success', text: t('draft.saved') })
    } catch {
      setBanner({ type: 'error', text: t('draft.saveFailed') })
    } finally {
      setBusySave(false)
    }
  }

  // Ortak: Taslak Modülü ile üret (lang parametresi verilebilir)
  async function runDraftWith(langParam: 'tr' | 'en', setBusy: (v: boolean) => void, forceEnglishInstruction = false) {
    setBusy(true)
    setBanner(null)
    try {
      const baseQ = `${title ? (title + '\n\n') : ''}${description || ''}`.trim()
      if (!baseQ) {
        setBanner({ type: 'error', text: t('errors.questionTextNotFound') })
        setBusy(false)
        return
      }

      // EN butonu için güvenli dil yönlendirmesi ekliyoruz
      const question_text = forceEnglishInstruction
        ? `Please answer in English.\n\n${baseQ}`
        : baseQ

      // Test sekmesindeki body ile aynı
      const body = {
        question_text,
        lang: langParam,            // 'tr' | 'en'
        style: DEFAULT_STYLE,       // 'teknik' (sabit)
        strict_citations: true,
        legal_disclaimer: true,
        rag: false,
      }

      const res = await fetch(`${DRAFT_MODULE_RUN_ENDPOINT}${qsEmail}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const ct = res.headers.get('content-type') || ''
      const j = ct.includes('application/json') ? await res.json() : JSON.parse(await res.text())

      if (!res.ok || !j?.ok) {
        const msg = (j as ApiErr)?.display || (j as ApiErr)?.error || t('draft.genFailed')
        setBanner({ type: 'error', text: msg })
        setBusy(false)
        return
      }

      const text: string = (j?.data?.text?.toString?.()) || (j?.text?.toString?.()) || ''
      if (text && text.trim().length > 0) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('editor:set-text', { detail: text }))
        }
        setContent(text)
        setBanner({ type: 'success', text: t('draft.generated') })
      } else {
        setBanner({ type: 'info', text: t('draft.generatedEmpty') })
      }
    } catch {
      const msg = t('draft.genUnexpected')
      setBanner({ type: 'error', text: msg })
    } finally {
      setBusy(false)
    }
  }

  // Özetle — içeriğin dilini basitçe algıla (TR karakterleri varsa 'tr', yoksa 'en')
async function handleSummarize() {
  // Son revizyonu özetler ve editöre yazar
  if (busySumm) return
  setBusySumm(true)
  setBanner(null)
  try {
    const qsEmail = adminEmail ? `?email=${encodeURIComponent(adminEmail)}` : ''
    const latestRes = await fetch(`/api/admin/questions/${questionId}/revisions/latest${qsEmail}`, { cache: 'no-store' })
    const latest = await latestRes.json().catch(() => ({ ok: false }))
    if (!latestRes.ok || !latest?.ok || !latest?.data?.content) {
      setBanner({ type: 'error', text: t('revise.lastFetchFailed') })
      setBusySumm(false)
      return
    }
    const source = String(latest.data.content || '').trim()
    if (!source) {
      setBanner({ type: 'error', text: t('revise.lastEmpty') })
      setBusySumm(false)
      return
    }
    // Dil tespiti
    const trHints = (source.match(/\b(ve|ile|olarak|bir|da|de|için|göre|bu|şu|çok|ancak)\b/gi) || []).length
    const enHints = (source.match(/\b(the|and|of|to|in|for|with|is|on|that|this)\b/gi) || []).length
    const hasTrChars = /[çğıöşüÇĞİÖŞÜ]/.test(source)
    const lang: 'tr' | 'en' = hasTrChars || trHints > enHints ? 'tr' : 'en'

    const res = await fetch(`/api/admin/gpt-answers/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text_md: source, lang, target_ratio: 0.65, keep_citations: true })
    })
    const json = await res.json().catch(() => ({} as any))
    const summaryText = (json as any)?.data?.text?.trim?.()
    if (summaryText) {
      try {
        window.dispatchEvent(new CustomEvent('editor:set-text', { detail: summaryText }))
      } catch {}
      setContent(summaryText)
      setBanner({ type: 'success', text: t('revise.summaryCreated') })
    } else {
      setBanner({ type: 'info', text: t('revise.summaryEmpty') })
    }
  } catch {
    const msg = t('revise.summaryUnexpected')
    setBanner({ type: 'error', text: msg })
  } finally {
    setBusySumm(false)
  }
}
  // PDF oluştur ve ekle — son revizyondan
  async function handleGeneratePdf() {
    if (busyPdf) return
    setBusyPdf(true)
    setBanner(null)
    try {
      // 1) Son revizyonu çek
      const latestRes = await fetch(`/api/admin/questions/${questionId}/revisions/latest${qsEmail}`, { cache: 'no-store' })
      const latest = await latestRes.json().catch(()=>({ ok:false }))
      if (!latestRes.ok || !latest?.ok || !latest?.data?.content) {
        setBanner({ type: 'error', text: t('revise.lastFetchFailed') })
        setBusyPdf(false)
        return
      }
      const text = String(latest.data.content || '').trim()
      if (!text) {
        setBanner({ type: 'error', text: t('revise.lastEmpty') })
        setBusyPdf(false)
        return
      }
      const lang: 'tr' | 'en' = /[çğıöşüÇĞİÖŞÜ]/.test(text) ? 'tr' : 'en'

      // 2) PDF üret ve storage:a koy
      const res = await fetch(`/api/admin/questions/${questionId}/attachments/generate-pdf${qsEmail}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang })
      })
   const j = await res.json().catch(()=>({ ok:false }))
     if (!res.ok || !j?.ok) {
        const msg = (j as ApiErr)?.display || (j as ApiErr)?.error || t('pdf.createFailedServer')
        setBanner({ type: 'error', text: msg })
        setBusyPdf(false)
       return
      }

      // 3) İndir ve sayfayı yenile
      try {
        const url = j?.data?.signed_url || j?.data?.url || null
        const filename = j?.data?.filename || 'Opinion_Letter.pdf'
        if (url) {
          const a = document.createElement('a')
          a.href = url
          a.download = filename
          a.rel = 'noreferrer'
          a.target = '_blank'
          document.body.appendChild(a)
          a.click()
          setTimeout(()=>{ try { a.remove() } catch {} }, 1000)
        }
      } catch {}
      setTimeout(()=> window.location.reload(), 800)
    } catch {
      setBanner({ type: 'error', text: t('pdf.createFailedServer') })
    } finally {
      setBusyPdf(false)
    }
  }


  async function handleCreatePdfAndAttach(){
    if (busyPdf) return
    try {
      setBusyPdf(true)
const brandName = locale === 'en' ? BRAND.nameEN : BRAND.nameTR
const name  = `${brandName} ${t('pdf.opinionLetter')}.pdf`
const org   = `${brandName} — ${t('pdf.opinionLetter')}`
const title = org
const subtitle = t('pdf.subtitleFromLastRevision')
const body = (content || '').trim()
if (!body) { setBanner({ type:'error', text: t('pdf.noContentToExport') }); return }
      const pdf = buildOpinionPdfBytes({ title, org, subtitle, body })
      let b64 = ''
      try { b64 = btoa(String.fromCharCode(...Array.from(pdf))) } 
      catch {
        let s = '', CH = 0x8000
        for (let i=0; i<pdf.length; i+=CH){ s += String.fromCharCode(...pdf.slice(i, i+CH)) }
        b64 = btoa(s)
      }
      const res = await fetch(`/api/admin/questions/${questionId}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, contentType: 'application/pdf', b64, scope: 'answer' }),
      })
      const j = await res.json().catch(()=>({ok:false}))
      if (!res.ok || !j?.ok){
        const msg = (j && j.error) ? j.error : t('pdf.uploadFailed')
        setBanner({ type: 'error', text: msg })
        return
      }
      setBanner({ type: 'success', text: t('pdf.createdAttached') })
    } catch(e:any){
      setBanner({ type: 'error', text: (e?.message || String(e)) })
    } finally {
      setBusyPdf(false)
    }
  }


  // TÜM LİNKLERİ ÇEVİR: worker'dayken /admin/request/* → /worker/editor/*
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (currentBase === '/admin/request') return
    const root = containerRef.current
    if (!root) return

    function findAnchor(el: HTMLElement | null): HTMLAnchorElement | null {
      while (el) {
        if (el instanceof HTMLAnchorElement) return el
        el = el.parentElement as HTMLElement | null
      }
      return null
    }

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      const target = e.target as HTMLElement | null
      const a = findAnchor(target)
      if (!a) return

      const raw = a.getAttribute('href') || ''
      if (!raw) return
      if (raw.startsWith('http') || raw.startsWith('mailto:') || raw.startsWith('#')) return

      if (raw.startsWith('/admin/request/')) {
        e.preventDefault()
        const replaced = raw.replace(/^\/admin\/request\//, `${currentBase}/`)
        router.push(replaced)
      }
    }

    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [currentBase, router])

  const sendDisabled =
    currentBase === '/worker/editor' && workerMessagingEnabled === false

  return (
    <section ref={containerRef} className="card-surface p-4 space-y-3 edge-underline edge-blue edge-taper edge-rise-2mm">
      {/* Üst bar */}
     <div className="flex flex-col md:flex-row items-start md:items-center justify-start md:justify-between gap-2 md:gap-4">
       <h2 className="text-lg font-semibold tracking-tight">{t('labels.editor')}</h2>
       <div className="flex items-center gap-2 md:gap-3 flex-wrap w-full md:w-auto justify-start md:justify-end min-w-0"> 
          {revizeInfo ? <span className="text-sm text-emerald-700 mr-2">{revizeInfo}</span> : null}

          {/* Taslak Üret → Hızlı Üretim sayfasına gider */}{/* Taslak Üret → Hızlı Üretim sayfası (yalnızca Admin) */}
{currentBase === '/admin/request' ? (


           <button
           onClick={() => router.push(`/admin/request/${questionId}/hizli-uretim${qsEmail}`)}
             className="btn btn--outline text-sm"
           title={t('tooltips.quickGen')}
          >
          {t('buttons.quickDraft')}
          </button>



          ) : null}

{/* Taslağı Kaydet */}
          <button
            onClick={() => void handleSaveDraft()}
            disabled={loading || busySave}
            className="btn btn--outline text-sm"
            title={t('tooltips.saveDraft')}
          >
            {busySave ? t('draft.saveBusy') : t('draft.save')}
          </button>

          {/* Revize tamamla */}
          <button
            onClick={triggerReviseCompleteClick}
            className="btn btn--outline text-sm"
            title={t('tooltips.applyReviseDone')}
          >
            {t('buttons.reviseDone')}
          </button>

          {/* Revizyonlar */}
          <Link
            href={`${currentBase}/${questionId}/revisions${qsEmail}`}
            className="btn btn--outline text-sm"
            title={t('tooltips.history')}
          >
             {t('buttons.revisions')}
          </Link>

                    {/* PDF oluştur */}
          <button
            onClick={handleGeneratePdf}
            disabled={busyPdf}
            className="btn btn--outline text-sm"
            title={t('pdf.fromLastRevisionTitle')}
          >
            {busyPdf ? t('pdf.busy') : t('pdf.create')}
          </button>
          {/* Önizle ve Gönder */}
          {sendDisabled ? (
            <span
              className="inline-flex items-center h-9 px-3 rounded-full border border-amber-300 bg-amber-100 text-amber-800 text-sm"
              title={t('tooltips.featureToggleHint')}
            >
             {t('labels.messagingDisabled')}
            </span>
          ) : (
            <SendModal questionId={questionId} adminEmail={adminEmail} />
          )}</div>
      </div>

      {/* Banner */}
      {banner ? (
        <div
            className={
            banner.type === 'error'
              ? 'rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 text-sm'
               : banner.type === 'success'
              ? 'rounded-xl border border-green-200 bg-green-50 text-green-700 p-3 text-sm'
           : 'rounded-xl border border-blue-200 bg-blue-50 text-blue-700 p-3 text-sm'
          }
        >
          {banner.text}
        </div>
      ) : null}

      {/* Bilgi satırı */}
      <div className="text-sm text-gray-600">
               {t('labels.questionId')}: <span className="font-mono">{questionId}</span> • {t('labels.latestDraft')}: <b>v{latestVersion || 0}</b>

      </div>

      {/* Editör */}
      <Editor />

      {/* Alt aksiyonlar */}
     <div className="flex items-center justify-between gap-3 flex-wrap">
        <AttachmentUploader questionId={questionId} />

      </div>

      {/* Ek aksiyonlar */}
      <div data-draft-actions className="flex items-center gap-2"><DraftActionButtons questionId={questionId} adminEmail={adminEmail} /></div>
    </section>
  )
}