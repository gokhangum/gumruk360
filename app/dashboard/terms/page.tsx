// app/dashboard/terms/page.tsx
import { getTranslations } from "next-intl/server";

export const revalidate = 3600;

// Başlığı /legal/terms ile senkron tut
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("legal.terms.title") };
}

// /legal/terms ile aynı içerik ve i18n anahtarlarını kullan
export default async function TermsDashboardPage() {
  const t = await getTranslations();

  // Rich text HTML içeriği (i18n dosyasında content_html anahtarı)
  const content =
    (t as any).raw?.("legal.terms.content_html") ?? t("legal.terms.content_html");

  return (
      <div className="-mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 w-full max-w-none md:max-w-[928px]">
        <div className="card-surface shadow-colored p-5 md:p-6 space-y-6">
          <main className="max-w-[clamp(320px,90vw,840px)] mx-auto px-0 md:px-0 lg:px-0 py-1 text-[15px] md:text-[15.5px] leading-relaxed">
            <header className="mb-6">
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
                {t("legal.terms.title")}
              </h1>

              <div className="mt-3 text-sm text-slate-600 space-y-1">
                <div>
                  <strong>{t("legal.terms.effective_date_label")}</strong>{" "}
                  <span>{t("legal.terms.effective_date_value")}</span>
                </div>
                <div>
                  <strong>{t("legal.terms.last_update_label")}</strong>{" "}
                  <span>{t("legal.terms.last_update_value")}</span>
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
