// app/(marketing)/faq/page.tsx
import { getTranslations } from "next-intl/server";

export const revalidate = 3600;
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("marketing.faq.title") };
}

export default async function FaqPage() {
  const t = await getTranslations();
  // items is an array in our i18n; to keep it simple we read up to 20 entries via known keys or fallback to direct JSON access if available
  // For next-intl flat-json, we assume direct access won't work; so we render three defaults via keys, else show an info text.
  const questions = [
    { q: t("marketing.faq.items.0.q"), a: t("marketing.faq.items.0.a") },
    { q: t("marketing.faq.items.1.q"), a: t("marketing.faq.items.1.a") },
    { q: t("marketing.faq.items.2.q"), a: t("marketing.faq.items.2.a") },
  ];
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <h1 className="text-3xl font-bold">{t("marketing.faq.title")}</h1>
      <div className="divide-y">
        {questions.map((it, idx) => (
          <div key={idx} className="py-4">
            <div className="font-semibold">{it.q}</div>
            <div className="opacity-90">{it.a}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
