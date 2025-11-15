
// app/(marketing)/cookies/page.tsx
export const dynamic = "force-static";

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getTranslations();
  return {
    title: m("legal.cookies.meta.title"),
    description: m("legal.cookies.meta.description"),
    alternates: { canonical: "/cookies" },
    robots: { index: true, follow: true },
    openGraph: {
      title: m("legal.cookies.meta.title"),
      description: m("legal.cookies.meta.description"),
      type: "article",
      url: "/cookies"
    }
  };
}

export default async function CookiesPage() {
  const t = await getTranslations();
  const content = (t as any).raw?.("legal.cookies.content_html") ?? t("legal.cookies.content_html");

  return (
    <main className="max-w-[clamp(320px,90vw,840px)] mx-auto px-4 md:px-6 lg:px-8 py-10">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
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
        className="prose prose-slate max-w-none prose-headings:scroll-mt-24 prose-a:underline-offset-2"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </main>
  );
}
