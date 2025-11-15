// app/dashboard/cookies/page.tsx
import { getTranslations } from "next-intl/server";

export const revalidate = 3600;

// Başlığı (marketing)/cookies ile aynı mantıkta, fakat doğru namespace ile tut
export async function generateMetadata() {
  const t = await getTranslations();
  return {
    title: t("legal.cookies.meta.title"),
    description: t("legal.cookies.meta.description"),
  };
}

// Dashboard sürümü: (marketing)/cookies ile aynı i18n kaynaklarını okur
export default async function CookiesDashboardPage() {
  const t = await getTranslations();

  // Zengin HTML içerik (i18n: legal.cookies.content_html)
  const content =
    (t as any).raw?.("legal.cookies.content_html") ??
    t("legal.cookies.content_html");

  return (
       <div className="-mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 w-full max-w-none md:max-w-[1200px]">
        <div className="card-surface shadow-colored p-5 md:p-6 space-y-6">
          <main className="max-w-[clamp(320px,90vw,840px)] mx-auto px-0 md:px-0 lg:px-0 py-1 text-[15px] md:text-[15.5px] leading-relaxed">
            <header className="mb-6">
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
                {t("legal.cookies.title")}
              </h1>
              <div className="mt-3 text-sm text-slate-600 space-y-1">
                <div>
                  <strong>{t("legal.cookies.effective_date_label")}</strong>{" "}
                  <span>{t("legal.cookies.effective_date_value")}</span>
                </div>
                <div>
                  <strong>{t("legal.cookies.last_update_label")}</strong>{" "}
                  <span>{t("legal.cookies.last_update_value")}</span>
                </div>
              </div>
            </header>

            <article
              className="prose prose-sm prose-slate max-w-none prose-headings:scroll-mt-24 prose-a:underline-offset-2"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </main>
        </div>
      </div>

  );
}
