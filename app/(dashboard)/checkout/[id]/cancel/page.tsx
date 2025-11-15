// app/checkout/[id]/cancel/page.tsx
import { getTranslations } from "next-intl/server"
export default async function CheckoutCancelPage() {
	const t = await getTranslations({ namespace: "checkoutCancel" })
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-2">{t("title")}</h1>
      <p>{t("message")}</p>
    </div>
  )
}
