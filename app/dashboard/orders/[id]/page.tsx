// app/dashboard/orders/[id]/page.tsx
import { notFound } from "next/navigation"
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"
import { getTranslations, getLocale } from "next-intl/server"
function statusBadge(status: string, label: string) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
  const map: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    failed: "bg-red-100 text-red-700",
  }
  const cls = map[status] || "bg-gray-100 text-gray-700"
  return <span className={`${base} ${cls}`}>{label}</span>
}


export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
	  const t = await getTranslations("orders")
  const tCommon = await getTranslations("common")
  const locale = await getLocale()
  const nf2 = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const amountStrFmt = (cents?: number | null, cur?: string | null) =>
    (cents == null ? "-" : `${nf2.format((cents || 0) / 100)} ${cur || "TRY"}`)

  const { id } = await params


  // Order
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id, status, amount, currency, created_at, paid_at, question_id")
    .eq("id", id)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  if (!order) {
    notFound()
  }

  // Son ödeme özeti (varsa)
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("provider, provider_ref, amount_cents, currency, status, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const amountStr = amountStrFmt(order.amount, order.currency)

  return (
    <div className="-mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 w-full max-w-none md:max-w-[615px]">
        <div className="card-surface shadow-colored rounded-none md:rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
      <h1 className="text-xl md:text-2xl font-semibold">{t("detailTitle")}</h1>
</div>
      <div className="grid gap-3 max-w-xl">
        <div className="card-surface p-4">
         <div className="text-s">{t("orderId")}</div>

          <div className="font-mono break-all text-sm text-gray-600">{order.id}</div>
        </div>

        <div className="card-surface p-4 grid grid-cols-2 gap-4">
          <div>
<div className="text-xs">{t("status")}</div>
<div className="font-medium text-sm text-gray-600 flex items-center gap-2">
  {statusBadge(order.status, t(`statusMap.${order.status as "paid"|"pending"|"failed"}`))}
</div>

          </div>
          <div>
        <div className="text-xs">{t("amount")}</div>
<div className="font-medium text-sm text-gray-600">{amountStr}</div>

          </div>
          <div>
<div className="text-xs">{t("createdAt")}</div>
<div className="font-medium text-sm text-gray-600">{new Date(order.created_at).toLocaleString(locale)}</div>
          </div>
        <div>
<div className="text-xs">{t("paidAt")}</div>
<div className="font-medium text-sm text-gray-600">
  {order.paid_at ? new Date(order.paid_at).toLocaleString(locale) : "—"}
</div>

        </div>
</div>
        {/* Ödeme Özeti (varsa) */}
        {payment ? (
          <div className="card-surface p-4 grid gap-2">
            <div className="text-s">{t("lastestPayment")}</div>
            <div className="text-sm">
              <div><b>{t("provider")}:</b> {payment.provider} {payment.provider_ref ? `• ${payment.provider_ref}` : ""}</div>
            {/* <div> 
                <b>Tutar:</b> {(payment.amount_cents / 100).toFixed(2)} {payment.currency || "TRY"} 
            </div>
            <div><b>Durum:</b> {payment.status}</div> */}
              <div><b>{t("date")}:</b> {new Date(payment.created_at).toLocaleString()}</div>
            </div>
          </div>
        ) : null}

       <div className="card-surface p-4">
         

          {order.question_id ? (
<a className="btn btn--outline text-sm" href={`/dashboard/questions/${order.question_id}`}>
  {t("goToQuestion")}
</a>

          ) : (
            <div className="text-gray-600">—</div>
          )}
        </div>

     
      </div>
    </div>  </div>
  )
}
