// app/api/dashboard/route.ts
import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
export const dynamic = "force-dynamic" // her istekte üret
export const runtime = "nodejs"

export async function GET(req: Request) {
   const accept = req.headers.get("accept-language") || ""
   const locale = accept.toLowerCase().startsWith("en") ? "en" : "tr"
   const t = await getTranslations({ locale, namespace: "dashboardApi" })
  try {
    const now = new Date()
    const inHours = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString()

    // DEMO veri — sonradan gerçek DB ile değiştiririz
    const recentQuestions = [
      { id: "101", title: t("recentQuestions.q101.title"), status: "new", created_at: new Date(now.getTime() - 6 * 3600_000).toISOString(), sla_due_at: inHours(18) },
      { id: "102", title: t("recentQuestions.q102.title"), status: "in_review", created_at: new Date(now.getTime() - 30 * 3600_000).toISOString(), sla_due_at: inHours(48) },
       { id: "103", title: t("recentQuestions.q103.title"), status: "waiting_payment", created_at: new Date(now.getTime() - 3 * 24 * 3600_000).toISOString(), sla_due_at: inHours(72) },
       { id: "104", title: t("recentQuestions.q104.title"), status: "warning", created_at: new Date(now.getTime() - 5 * 24 * 3600_000).toISOString(), sla_due_at: inHours(6) },
       { id: "105", title: t("recentQuestions.q105.title"), status: "closed", created_at: new Date(now.getTime() - 7 * 24 * 3600_000).toISOString(), sla_due_at: null },
    ]

    const stats = {
      totalQuestions: recentQuestions.length,
      openQuestions: recentQuestions.filter(q => q.status !== "closed").length,
      pendingPricing: recentQuestions.filter(q => q.status === "in_review").length,
      slaDueSoon: recentQuestions.filter(q => q.sla_due_at && (new Date(q.sla_due_at).getTime() - now.getTime()) < 24 * 3600_000).length,
    }

    return NextResponse.json({
      ok: true,
      stats,
      recentQuestions,
      alerts: [
        { id: "a1", type: "warning", title: t("alerts.slaNear.title"), message: t("alerts.slaNear.message", { id: "104", hours: 6 }) },
      ],
    }, { status: 200 })
  } catch (err: any) {
    // 500 yerine 200 + ok:false döndürüyoruz ki UI kırılmasın
    return NextResponse.json({
      ok: false,
      error: err?.message ?? "unknown error",
    }, { status: 200 })
  }
}
