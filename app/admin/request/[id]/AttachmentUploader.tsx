'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
type Props = {
  questionId: string
}

type Item = {
  name: string
  display_name?: string
  path: string
  url: string | null
  size: number | null
  created_at?: string | null
  updated_at?: string | null
}

function humanSize(n: number | null | undefined) {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`
  if (n < 1024*1024*1024) return `${(n/(1024*1024)).toFixed(1)} MB`
  return `${(n/(1024*1024*1024)).toFixed(1)} GB`
}

export default function AttachmentUploader({ questionId }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
const t = useTranslations('admin.request.editor')
  const base = useMemo(() => {
    if (typeof window === 'undefined') return '/api/admin'
    return window.location.pathname.startsWith('/worker') ? '/api/worker' : '/api/admin'
  }, [])

  async function refresh() {
    setErr(null)
    try {
      const r = await fetch(`${base}/questions/${questionId}/attachments`, { cache: 'no-store' })
      // Eğer middleware HTML döndürürse (örn. admin/login), JSON parse patlamasın diye kontrol:
      const text = await r.text()
      try {
        const j = JSON.parse(text)
        if (j?.ok) setItems(j.data || [])
        else setItems([])
        if (!r.ok && j?.display) setErr(j.display)
      } catch {
        // HTML geldi → anlamlı hata
       setErr(t('attachments.loadAuthError'))
        setItems([])
      }
    } catch (e: any) {
    setErr(e?.message || t('attachments.loadFailed'))
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, base])

  async function onFilesSelected(files: FileList | null) {
    if (!files || !files.length) return
    setBusy(true); setErr(null)
    try {
      const fd = new FormData()
      Array.from(files).forEach(f => fd.append('files', f))
      const r = await fetch(`${base}/questions/${questionId}/attachments`, { method: 'POST', body: fd })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) {
       setErr(j?.display || t('attachments.uploadFailed'))
      } else {
        await refresh()
      }
      if (fileInput.current) fileInput.current.value = ''
    } catch (e: any) {
      setErr(e?.message || t('attachments.uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(path: string) {
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`${base}/questions/${questionId}/attachments?path=${encodeURIComponent(path)}`, {
        method: 'DELETE'
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) {
        setErr(j?.display || t('attachments.deleteFailed'))
      } else {
        await refresh()
      }
    } catch (e: any) {
      setErr(e?.message || t('attachments.deleteFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card-surface p-3 space-y-3 w-full">
      <div className="flex items-center justify-between gap-3">
       <h3 className="text-base font-semibold tracking-tight">{t('attachments.header')}</h3>
        <label className="btn btn--outline text-sm h-10 px-4 cursor-pointer">
         <span>{t('attachments.addFile')}</span>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => void onFilesSelected(e.target.files)}
            disabled={busy}
          />
         <span className="px-3 py-1 border rounded">{t('attachments.select')}</span>
        </label>
      </div>

      {err ? <div className="text-sm text-red-600">{err}</div> : null}

      {items.length === 0 ? (
        <div className="text-sm text-gray-500">{t('attachments.empty')}</div>
      ) : (
        <ul className="space-y-2">
          {items.map(it => (
            <li key={it.path} className="flex items-center justify-between gap-3 rounded-xl border p-3 hover:bg-gray-50 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  {it.url ? (
                    <a href={it.url} target="_blank" rel="noreferrer" className="underline hover:opacity-80">
                      {it.display_name || it.name}
                    </a>
                  ) : (
                    <span>{it.display_name || it.name}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {humanSize(it.size)} {it.created_at ? `• ${new Date(it.created_at).toLocaleString()}` : ''}
                </div>
              </div>
              <button
                onClick={() => void remove(it.path)}
                className="btn btn--outline text-sm h-9 px-3 disabled:opacity-50"
                disabled={busy}
                title={t('attachments.delete')}
              >
              {t('attachments.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
