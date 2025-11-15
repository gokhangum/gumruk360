'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
export default function DraftActionButtons({
  questionId,
  adminEmail,
}: {
  questionId: string
  adminEmail: string
}) {
  const [busy, setBusy] = React.useState(false)
  const [savedInfo, setSavedInfo] = React.useState<string>('')
const t = useTranslations('admin.request.editor')
  /* ---- Editör erişim yardımcıları ---- */
  function getEditorEl(): HTMLTextAreaElement | HTMLDivElement | null {
    const bridge = document.querySelector('textarea[data-editor-content]') as HTMLTextAreaElement | null
    if (bridge) return bridge
    const area = document.querySelector('[data-editor] textarea') as HTMLTextAreaElement | null
    if (area) return area
    const div = document.querySelector('[data-editor] [contenteditable="true"]') as HTMLDivElement | null
    return div
  }

  function getEditorHtml(): string {
    const htmlBridge = document.querySelector('textarea[data-editor-content-html]') as HTMLTextAreaElement | null
    if (htmlBridge && typeof htmlBridge.value === 'string') return htmlBridge.value
    const ck = document.querySelector('.ck-editor .ck-content') as HTMLElement | null
    if (ck) return ck.innerHTML
    const el = getEditorEl() as HTMLDivElement | null
    return el?.innerHTML || ''
  }

  function getEditorText(): string {
    const el = getEditorEl()
    if (!el) return ''
    if (el instanceof HTMLTextAreaElement) return el.value
    return el.innerText || ''
  }

  function makeSummary(text: string, html: string): string {
    const basis = (html && html.trim().length > 0)
      ? html.replace(/<[^>]*>/g, ' ')
      : text
    return basis.replace(/\s+/g, ' ').trim().slice(0, 400)
  }

  async function onReviseComplete() {
    if (busy) return
    try {
      setBusy(true)
      setSavedInfo('')

      const content = getEditorText()
      const content_html = getEditorHtml()
      const summary = makeSummary(content, content_html)

      const res = await fetch(`/api/admin/questions/${questionId}/revise-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, content_html, summary }),
      })
      const js = await res.json().catch(() => ({} as any))

      if (!res.ok || !js?.ok) {
        const message = js?.error || res.statusText || t('draft.saveFailedShort')
        setSavedInfo(t('revise.saveError', { message }))
        return
      }

      const no = js?.revision_no ?? '—'
      setSavedInfo(t('revise.savedInfo', { no }))
    } catch (e: any) {
      setSavedInfo(t('revise.saveError', { message: e?.message || t('common.unknown') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onReviseComplete}
        disabled={busy}
        className="inline-block border rounded px-3 py-1.5 text-sm disabled:opacity-50"
        title={t('tooltips.applyReviseDone')}
      >
       {busy ? t('progress.completing') : t('buttons.reviseDone')}
      </button>

      {savedInfo && (
        <span className="text-xs text-green-700" role="status">
          {savedInfo}
        </span>
      )}
    </div>
  )
}
