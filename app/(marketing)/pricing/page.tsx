// app/(marketing)/pricing/page.tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const revalidate = 3600;
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("marketing.pricing.title") };
}

export default async function PricingPage() {
  const t = await getTranslations();
  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-6">
      <h1 className="text-3xl font-bold">{t("marketing.pricing.title")}</h1>
      <p className="opacity-90">{t("marketing.pricing.subtitle")}</p>
      <div className="rounded-2xl p-6 shadow bg-card">
        <div className="text-lg font-semibold mb-2">Credits</div>
        <p className="mb-4 opacity-90">{t("marketing.pricing.notes")}</p>
        <Link href="/credits" className="inline-block rounded-2xl px-4 py-2 shadow bg-primary text-primary-foreground">
          {t("marketing.pricing.cta")}
        </Link>
      </div>
    </main>
  );
}
