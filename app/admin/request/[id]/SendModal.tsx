'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from "next-intl"
type AttItem = { name: string; path: string; url: string | null }

export default function SendModal({
  questionId,
  adminEmail,
  defaultSubject,
  disabled = false
}: {
  questionId: string
  adminEmail: string
  defaultSubject?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toEmail, setToEmail] = useState('')
  const [subject, setSubject] = useState(defaultSubject || '')
  const [html, setHtml] = useState('')
const t = useTranslations('admin.request.editor')
  // Ekler
  const [atts, setAtts] = useState<AttItem[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  const qs = `?email=${encodeURIComponent(adminEmail)}`

  function readEditorHtmlFallback(): string {
    if (typeof document === 'undefined') return ''
    const htmlEl = document.querySelector('textarea[data-editor-content-html]') as HTMLTextAreaElement | null
    const textEl = document.querySelector('textarea[data-editor-content]') as HTMLTextAreaElement | null
    const h = (htmlEl?.value || '').trim()
    if (h) return h
    const t = (textEl?.value || '')
    return t ? t.replace(/\n/g, '<br/>') : ''
  }

  // Modal açıkken editörden canlı güncelleme (event tabanlı)
  useEffect(() => {
    if (!open) return
    const onHtml = (e: any) => setHtml(String(e.detail || ''))
    const onText = (e: any) => {
      const cur = String(e.detail || '')
      setHtml(prev => prev || cur.replace(/\n/g, '<br/>'))
    }
    window.addEventListener('editor:content-html', onHtml as any)
    window.addEventListener('editor:content', onText as any)
    return () => {
      window.removeEventListener('editor:content-html', onHtml as any)
      window.removeEventListener('editor:content', onText as any)
    }
  }, [open])

  // ESC ile kapatma
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function safeJson<R = any>(r: Response): Promise<R | null> {
    const ct = r.headers.get('content-type') || ''
    try {
      if (ct.includes('application/json')) {
        return await r.json()
      }
      const raw = await r.text()
      try { return JSON.parse(raw) } catch { return null }
    } catch {
      return null
    }
  }

  async function openPreview() {
    if (disabled) return
    setBusy(true)
    try {
      // 1) Önizleme verileri
      const r = await fetch(`/api/admin/questions/${questionId}/send/preview${qs}`, {
        credentials: 'include',
        cache: 'no-store'
      })

      const j = await safeJson(r)
      if (!r.ok || !j || j.ok === false) {
        const errMsg =
          (j as any)?.error ||
          (j as any)?.message ||
          (await r.text().catch(() => '')) ||
          `HTTP ${r.status}`
       throw new Error(errMsg || t('send.previewFailed'))
      }

      setToEmail((j as any).data?.toEmail || '')
      setSubject((j as any).data?.subject || subject || defaultSubject || '')

      // 2) EKLER (cevap ekleri)
      try {
        const ra = await fetch(`/api/admin/questions/${questionId}/attachments`, { cache: 'no-store' })
        const ja = await safeJson(ra)
        if (ra.ok && ja && (ja as any).ok) {
          const list: AttItem[] = ((ja as any).data || []).map((x: any) => ({
            name: x.name,
            path: x.path,
            url: x.url ?? null,
          }))
          setAtts(list)
          const initial: Record<string, boolean> = {}
          for (const it of list) initial[it.path] = true
          setSelected(initial)
        } else {
          setAtts([]); setSelected({})
        }
      } catch { setAtts([]); setSelected({}) }

      // 3) HTML: editörde varsa API’yi override et
      const apiHtml = (j as any).data?.html || ''
      const editorHtml = readEditorHtmlFallback()
      setHtml(editorHtml || apiHtml)

      setOpen(true)
    } catch (e: any) {
      alert(t('send.previewError', { message: e?.message || t('common.unknown') }))
    } finally {
      setBusy(false)
    }
  }

  async function sendNow() {
    if (disabled) return
    if (!toEmail || !subject) {
     alert(t('send.validation.toAndSubjectRequired'))
      return
    }
    setBusy(true)
    try {
      const chosen = atts.filter((a) => selected[a.path])
      const r = await fetch(`/api/admin/questions/${questionId}/send${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: toEmail,
          subject,
          html, // editörden gelen HTML
          attachments: chosen.map((c) => ({ path: c.path, name: c.name })),
        }),
      })

      const j = await safeJson(r)
      if (!r.ok || !j || (j as any).ok === false) {
        const raw = !j ? await r.text().catch(() => '') : ''
        const msg =
          (j as any)?.error || (j as any)?.message || raw || `HTTP ${r.status}`
        alert(t('send.sendError', { message: msg }))
        return
      }

      alert(t('send.sent'))
      setOpen(false)
      location.reload()
    } catch (e: any) {
     alert(t('send.sendError', { message: e?.message || t('common.unknown') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        className="btn btn--outline text-sm"
        onClick={openPreview}
        disabled={busy || disabled}
        title={disabled ? t('send.disabledTitle') : t('send.openTitle')}
      >
        {busy ? t('send.preparing') : t('send.open')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.currentTarget === e.target) setOpen(false) }}
        >
          {/* MODAL: max-h + flex-col → gövde scroll, alt bant sabit */}
          <div className="bg-white max-w-5xl w-full rounded-xl shadow-xl flex flex-col max-h-[90vh]">
            {/* Başlık */}
            <div className="p-4 border-b flex items-center justify-between shrink-0">
              <h3 className="font-semibold">{t('send.modalTitle')}</h3>
             <button className="text-sm underline" onClick={() => setOpen(false)}>{t('send.close')}</button>
            </div>

            {/* GÖVDE */}
            <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
              <div className="grid grid-cols-2 gap-3">
                <input className="border rounded px-2 py-1" placeholder={t('send.toPlaceholder')} value={toEmail} onChange={(e) => setToEmail(e.target.value)} disabled={busy || disabled} />
                <input className="border rounded px-2 py-1" placeholder={t('send.subjectPlaceholder')} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy || disabled} />
              </div>

              {/* EKLER */}
              <div className="border rounded p-2">
               <div className="text-xs text-gray-500 mb-2">{t('send.attachmentsHeader')}</div>
                {atts.length === 0 ? (
                  <div className="text-sm text-gray-500">{t('send.noAttachments')}</div>
                ) : (
                  <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {atts.map((a) => (
                      <li key={a.path} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={!!selected[a.path]}
                          onChange={(e) => setSelected((s) => ({ ...s, [a.path]: e.target.checked }))}
                          disabled={busy || disabled}
                        />
                        {a.url && a.name.match(/\.(png|jpe?g|gif|webp|svg|pdf)$/i) ? (
                          <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline" title={t('send.previewOrDownloadTitle')}>
                            {a.name.match(/\.(png|jpe?g|gif|webp|svg)$/i) ? (
                              <img src={a.url} alt={a.name} className="w-10 h-10 object-cover rounded" />
                            ) : null}
                            <span className="text-sm">{a.name}</span>
                          </a>
                        ) : a.url ? (
                          <a href={a.url} target="_blank" rel="noreferrer" className="text-sm underline" title={t('send.downloadTitle')}>{a.name}</a>
                        ) : (
                          <span className="text-sm">{a.name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ÖNİZLEME */}
              <div className="border rounded overflow-hidden bg-gray-50">
                <iframe title="preview" className="w-full bg-white" style={{ height: '55vh' }} srcDoc={html} />
              </div>
            </div>

            {/* ALT BANT */}
            <div className="p-4 border-t flex justify-end gap-2 bg-white shrink-0">
             <button className="px-3 py-1 border rounded" onClick={() => setOpen(false)} disabled={busy}>{t('send.cancelBtn')}</button>
              <button className="px-3 py-1 border rounded bg-blue-600 text-white" onClick={sendNow} disabled={busy || disabled}>
               {busy ? t('send.sending') : t('send.sendBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
