// app/(marketing)/legal/terms/page.tsx
import { getTranslations } from "next-intl/server";

export const revalidate = 3600;
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("legal.terms.meta.title") };
}
export default async function TermsPage() {
  const t = await getTranslations();
  const content = (t as any).raw?.("legal.terms.content_html") ?? t("legal.terms.content_html");

  return (
      <div className="bg-gradient-to-b from-white to-slate-0 py-1">
    <div className="w-full px-0 py-4 md:max-w-[clamp(320px,80vw,928px)] md:mx-auto md:px-6 lg:px-8 md:py-6">
      <div className="card-surface shadow-colored p-5 md:p-6 space-y-5 w-full max-w-[clamp(320px,80vw,928px)] mx-auto prose prose-slate max-w-none prose-img:my-0">
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
    </main></div></div></div>
  );
}
