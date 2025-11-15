import { getTranslations } from "next-intl/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export default async function PrecheckBlockPage(
  { searchParams }: { searchParams: Promise<{ status?: string; reason?: string }> }
 ) {
  const sp = await searchParams
  const t = await getTranslations("ask.precheckBlock")
  const status = (sp?.status || '').toString()
  const reason = decodeURIComponent((sp?.reason || '').toString())

let title = t("warnTitle")
let msg = reason || t("failed")

if (status === "not_clear") {
  title = t("notClearTitle")
  if (!reason) msg = t("notClearMsg")
} else if (status === "out_of_scope") {
  title = t("outOfScopeTitle")
  if (!reason) msg = t("outOfScopeMsg")
} else if (status === "error") {
  title = t("errorTitle")
  if (!reason) msg = t("errorMsg")
}


  return (
    <div className="max-w-none md:max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg}</p>

      <div className="mt-4">
        <a href="/ask" className="inline-flex ... text-sm">{t("backToAsk")}</a>
      </div>
    </div>
  )
}