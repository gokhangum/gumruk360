'use client'
import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useTranslations } from "next-intl";
type Q = { precheck_result?: any }
function Block({ data }: { data: Q | null }) {
	const t = useTranslations("l2info")
  const l2 = data?.precheck_result?.level2
  const missing = l2?.result?.missing || l2?.missing || l2?.result?.groups || l2?.result?.items
  const req = Array.isArray(missing?.required) ? missing.required.length : 0
  const sh  = Array.isArray(missing?.should)   ? missing.should.length   : 0
  const inf = Array.isArray(missing?.info)     ? missing.info.length     : 0
  return (
    <div className="mt-6 border rounded-xl p-4 bg-gray-50">
      <div className="font-semibold mb-2">{t("title")}</div>
      {!l2 ? (
        <div className="text-sm text-gray-600">{t("notReady")}</div>
      ) : (
        <div className="text-sm space-y-1">
          <div>{t("labels.status")}: <b>{l2?.status || t("statusOk")}</b></div>
          <div>{t("labels.confidence")}: <b>{typeof l2?.confidence === 'number' ? l2.confidence.toFixed(2) : '-'}</b></div>
          <div className="flex gap-6">
            <span>{t("labels.requiredMissing")}: <b>{req}</b></span>
            <span>{t("labels.shouldMissing")}: <b>{sh}</b></span>
            <span>{t("labels.info")}: <b>{inf}</b></span>
          </div>
        </div>
      )}
    </div>
  )
}
export default function L2InfoClient({ id }: { id: string }) {
  const supabase = createClientComponentClient()
  const [data, setData] = useState<Q | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data } = await supabase
          .from('questions')
          .select('precheck_result')
          .eq('id', id)
          .maybeSingle()
        if (alive) setData(data as Q)
      } catch {
        if (alive) setData(null)
      }
    })()
    return () => { alive = false }
  }, [id])
  return <Block data={data} />
}
