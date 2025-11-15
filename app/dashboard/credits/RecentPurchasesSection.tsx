import { getTranslations } from "next-intl/server";
import dynamic from "next/dynamic";
const RecentPurchases = dynamic(() => import("./RecentPurchases"), { ssr: false });

export default async function RecentPurchasesSection() {
  const t = await getTranslations('cred');

  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold mb-2">{t('recent.title')}</h2>

      <RecentPurchases />
    </section>
  );
}
