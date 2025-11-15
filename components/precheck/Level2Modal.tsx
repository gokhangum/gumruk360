'use client'

import { useMemo, useState } from 'react'
import { useTranslations, useLocale } from "next-intl";
type Item = { key: string; label_tr?: string; label_en?: string; reason_tr?: string; reason_en?: string; source?: string }

export default function Level2Modal({
  
  data,
  onEdit,
  onContinue,
  onClose,
}: {
  
  data: {
    status: 'ok'|'error',
    missing?: { required: Item[], should: Item[], info: Item[] },
    groups?: { required?: Item[], should?: Item[], info?: Item[] }, // tolerant
    items?: { required?: Item[], should?: Item[], info?: Item[] },  // tolerant
  }
  onEdit: () => void
  onContinue: () => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)

  const t = useTranslations("common.level2Modal")
const lang = useLocale(); // "tr" | "en" | ...
const isTR = (lang || "").toLowerCase().startsWith("tr");
  // Normalize sources: prefer data.missing, fall back to groups/items
  const missing = useMemo(() => {
    const m = data?.missing || {}
    const g = data?.groups || {}
    const i = data?.items || {}
    return {
  required: ((m as any).required ?? (g as any).required ?? (i as any).required ?? []) as Item[],
    should: ((m as any).should ?? (g as any).should ?? (i as any).should ?? []) as Item[],
    info: ((m as any).info ?? (g as any).info ?? (i as any).info ?? []) as Item[],
    }
  }, [data])

  const hasRequired = Array.isArray(missing.required) && missing.required.length > 0
  const hasShould = Array.isArray(missing.should) && missing.should.length > 0
  const hasInfo = Array.isArray(missing.info) && missing.info.length > 0
  const nothingToShow = !hasRequired && !hasShould && !hasInfo

  const renderList = (titleKey: string, items: Item[]) => (
    <div className="space-y-2">
      <h3 className="font-semibold">{t(titleKey)}</h3>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {items.map((it) => (
          <li key={it.key}>
            <span className="font-medium">
              {isTR ? (it.label_tr || it.key) : (it.label_en || it.key)}
            </span>
           {(() => {
              const reason = isTR ? (it.reason_tr || '') : (it.reason_en || '')
              return reason?.trim() ? (
                <span className="opacity-80"> — {reason}</span>
              ) : null
            })()}
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('title')}</h2>
		   <button onClick={onClose} className="text-sm opacity-70 hover:opacity-100">✕</button>
        </div>
<div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">{t('infoBanner')}</div>
         
        {nothingToShow ? (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
            {t('noMissing')}
          </div>
        ) : (
          <div className="space-y-4">
            {hasRequired && renderList('requiredTitle', missing.required)}
          {hasShould && renderList('recommendedTitle', missing.should)}
           {hasInfo && renderList('infoTitle', missing.info)}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={() => { setBusy(true); onEdit(); }}
            disabled={busy}
            className="px-3 py-2 text-sm rounded border bg-white hover:bg-gray-50 disabled:opacity-60"
          >
            {t('edit')}
          </button>
          <button
            onClick={() => { setBusy(true); onContinue(); }}
            disabled={busy}
            className="px-3 py-2 text-sm rounded bg-black text-white hover:opacity-90 disabled:opacity-60"
          >
            {t('continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
