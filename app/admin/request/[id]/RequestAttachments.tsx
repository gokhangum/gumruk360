'use client'

import { useEffect, useState } from 'react'
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
}

function toDisplayName(name: string, display?: string) {
  if (display && display.trim()) return display
  const m = name.match(/^\d+_[a-z0-9]+_(.+)$/i)
  return m ? m[1] : name
}

export default function RequestAttachments({ questionId }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
const t = useTranslations('admin.request.editor')
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        // ÖNEMLİ: Sadece ORİJİNAL SORU EKLERİ gelsin
        const r = await fetch(`/api/admin/questions/${questionId}/attachments?scope=question`, { cache: 'no-store' })
        const j = await r.json()
        if (!alive) return
        if (r.ok && j?.ok) {
          setItems(j.data || [])
          setErr(null)
        } else {
          setItems([])
         setErr(j?.display || t('attachments.loadFailed'))
        }
      } catch (e: any) {
        if (!alive) return
        setItems([])
        setErr(e?.message || t('attachments.loadFailed'))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [questionId])

  return (
    <section className="border rounded p-3 space-y-3">
      <div className="flex items-center justify-between">
       <h3 className="font-medium">{t('attachments.headerQuestion')}</h3>
        {!loading && !err ? (
         <span className="text-xs text-gray-500">{t('attachments.count', { count: items.length })}</span>
        ) : null}
      </div>

      {loading ? <div className="text-sm text-gray-500">{t('attachments.loading')}</div> : null}
      {err ? <div className="text-sm text-red-600">{err}</div> : null}

      {!loading && !err && items.length === 0 ? (
        <div className="text-sm text-gray-500">{t('attachments.emptyForQuestion')}</div>
      ) : null}

      {!loading && !err && items.length > 0 ? (
        <ul className="divide-y">
          {items.map((it) => {
            const pretty = toDisplayName(it.name, it.display_name)
            return (
              <li key={`${it.path}-${pretty}`} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm truncate">{pretty}</div>
                  {it.url ? (
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline"
                    >
                     {t('attachments.previewDownload')}
                    </a>
                  ) : (
                    <div className="text-xs text-gray-500">{t('attachments.linkFailed')}</div>
                  )}
                </div>
                {typeof it.size === 'number' ? (
                  <div className="text-xs text-gray-500 shrink-0">
                    {(it.size / 1024).toFixed(1)} {t('attachments.kb')}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
