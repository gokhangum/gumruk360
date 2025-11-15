// app/admin/request/[id]/Editor.tsx
'use client'

import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
type LoadState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready' }

// CKEditor’ü tamamen client-side dinamik yükle
const EditorCK = dynamic(
  async () => {
    const [{ CKEditor }, classicMod] = await Promise.all([
      import('@ckeditor/ckeditor5-react'),
      import('@ckeditor/ckeditor5-build-classic'),
    ])
    const ClassicEditor = (classicMod as any).default
    return function WrappedCKEditor(props: any) {
      return <CKEditor editor={ClassicEditor} {...props} />
    }
  },
  { ssr: false }
)

function tryParseJson(text: string): { ok: true; value: any } | { ok: false } {
  try { return { ok: true, value: JSON.parse(text) } } catch { return { ok: false } }
}

// Düz metni basit paragraflara çevir (başlangıç görünümü için)
function textToHtml(text: string) {
  if (!text) return ''
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc(text)
    .split(/\r?\n\r?\n/)
    .map(p => `<p>${p.replace(/\r?\n/g, '<br/>')}</p>`)
    .join('')
}

// HTML → düz metin (CKEditor değişiminde backend köprüsüne yazılacak)
function htmlToPlainText(html: string) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  div.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  ;['p','div','li','pre','h1','h2','h3','h4','h5','h6'].forEach(sel => {
    div.querySelectorAll(sel).forEach(el => el.insertAdjacentText('afterend', '\n'))
  })
  const txt = div.textContent || ''
  return txt.replace(/\s+$/,'')
}

export default function Editor() {
  const { id } = useParams<{ id: string }>()
  const [load, setLoad] = useState<LoadState>({ state: 'idle' })
  const [editorHtml, setEditorHtml] = useState<string>('')   // CKEditor HTML
  const [contentText, setContentText] = useState<string>('') // Backend’in okuduğu düz metin
const t = useTranslations('admin.request.editor')
  // Köprü alanları
  const textBridgeRef = useRef<HTMLTextAreaElement | null>(null)
  const htmlBridgeRef = useRef<HTMLTextAreaElement | null>(null)

  
  // Global getter for other components (DraftSaveButton)
  if (typeof window !== 'undefined') {
    ;(window as any).__editorGetContent = () => ({ text: contentText, html: editorHtml })
  }
const debounceTimer = useRef<NodeJS.Timeout | null>(null)

  // DIŞARIYA yayın — düz metin
  const emitTextEvent = useCallback((text: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('editor:content', { detail: text }))
    }
  }, [])

  // DIŞARIYA yayın — HTML
  const emitHtmlEvent = useCallback((html: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('editor:content-html', { detail: html }))
    }
  }, [])

  const syncBridges = useCallback((text: string, html: string) => {
    if (textBridgeRef.current) textBridgeRef.current.value = text
    if (htmlBridgeRef.current) htmlBridgeRef.current.value = html
  }, [])

  const scheduleEmit = useCallback((text: string, html: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      syncBridges(text, html)
      emitTextEvent(text)
      emitHtmlEvent(html)
    }, 300)
  }, [emitTextEvent, emitHtmlEvent, syncBridges])

  // === YENİ: DIŞARIDAN İÇERİK SET ETME ===
  const applyExternalText = useCallback((text: string) => {
    const html = textToHtml(text || '')
    setContentText(text || '')
    setEditorHtml(html)
    // köprüleri ve eventleri senkronla
    syncBridges(text || '', html)
    emitTextEvent(text || '')
    emitHtmlEvent(html)
  }, [emitHtmlEvent, emitTextEvent, syncBridges])

  const applyExternalHtml = useCallback((html: string) => {
    const txt = htmlToPlainText(html || '')
    setEditorHtml(html || '')
    setContentText(txt)
    syncBridges(txt, html || '')
    emitTextEvent(txt)
    emitHtmlEvent(html || '')
  }, [emitHtmlEvent, emitTextEvent, syncBridges])

  useEffect(() => {
    // EditorPanel gibi dış bileşenler buradan içerik basabilecek
    const onSetText = (e: Event) => {
      const detail = (e as CustomEvent).detail
      applyExternalText(typeof detail === 'string' ? detail : String(detail ?? ''))
    }
    const onSetHtml = (e: Event) => {
      const detail = (e as CustomEvent).detail
      applyExternalHtml(typeof detail === 'string' ? detail : String(detail ?? ''))
    }
    window.addEventListener('editor:set-text', onSetText as any)
    window.addEventListener('editor:set-html', onSetHtml as any)
    return () => {
      window.removeEventListener('editor:set-text', onSetText as any)
      window.removeEventListener('editor:set-html', onSetHtml as any)
    }
  }, [applyExternalHtml, applyExternalText])

  // İlk yükleme (son taslak → revizyon → boş)
    const reload = async () => {
    if (!id) return
    setLoad({ state: 'loading' })
    try {
      // TEK ÇAĞRI: latest (taslak vs revizyon hangisi yeniyse onu döner)
      const res = await fetch(`/api/admin/questions/${id}/latest`, { credentials: 'include', cache: 'no-store' })
      if (res.ok) {
        const j = await res.json().catch(() => null)
        if (j && j.ok) {
          const row = j.data
          if (row) {
            const raw = row.content
            const htmlRaw = row.content_html
            const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '', null, 2)
            const html = (typeof htmlRaw === 'string' && htmlRaw.trim().length > 0) ? htmlRaw : textToHtml(text)

            setContentText(text)
            setEditorHtml(html)
            syncBridges(text, html)
            emitTextEvent(text)
            emitHtmlEvent(html)
            setLoad({ state: 'ready' })
            return
          }
        }
      }
      // hiçbir şey bulunamadıysa boş ekrana düş
      setContentText('')
      setEditorHtml('')
      syncBridges('', '')
      emitTextEvent('')
      emitHtmlEvent('')
      setLoad({ state: 'ready' })
    } catch (e: any) {
      setLoad({ state: 'error', message: e?.message ?? t('editorView.genericError') })
    }
  }


  useEffect(() => {
    reload()
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // CKEditor değişince
  const onEditorChange = (_event: any, editor: any) => {
    const html = editor.getData?.() ?? ''
    setEditorHtml(html)
    const plain = htmlToPlainText(html)
    setContentText(plain)
    scheduleEmit(plain, html)
  }
   // Editör yüksekliği: min 70vh
   const onEditorReady = (editor: any) => {
     const root = editor?.editing?.view?.document?.getRoot?.();
     if (!root) return;
    editor.editing.view.change((writer: any) => {
      writer.setStyle('min-height', '50vh', root);
       writer.setStyle('height', '50vh', root);
   });
   };

  // Classic build toolbar
  const ckConfig = useMemo(() => ({
    toolbar: [
      'undo', 'redo', '|',
      'heading', '|',
      'bold', 'italic', 'link', '|',
      'bulletedList', 'numberedList', 'outdent', 'indent', '|',
      'blockQuote', 'insertTable'
    ],
  }), [])

  // Hızlı Taslak aktarımı geçici olarak devre dışı (istenirse yeniden eklenebilir)
return (
   <div className="w-full max-w-full overflow-x-auto">
      <div className="card-surface p-0 rounded-xl overflow-hidden max-w-full">
         <EditorCK data={editorHtml} onChange={onEditorChange} onReady={onEditorReady} config={ckConfig} />
      </div>

      {/* Backend köprüsü — düz metin */}
      <textarea data-editor-content ref={textBridgeRef} value={contentText} readOnly hidden />
      {/* Önizleme için HTML köprüsü */}
      <textarea data-editor-content-html ref={htmlBridgeRef} value={editorHtml} readOnly hidden />

      {load.state === 'loading' && <div className="mt-3 text-sm text-gray-700">{t('editorView.loading')}</div>}
      {load.state === 'error' && <div className="mt-3 text-sm text-red-600">{t('editorView.loadError', { message: load.message })}</div>}
    </div>
  )
}
