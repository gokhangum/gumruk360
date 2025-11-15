export const dynamic = "force-dynamic";
export const revalidate = 0;
import MarketingLayout from "@/components/layout/MarketingLayout";
import Hero from "@/components/marketing/Hero";
import QuickActions from "@/components/marketing/QuickActions";
import ProductGrid from "@/components/marketing/ProductGrid";
import NewsLatestThree from "@/components/news/LatestThree"; // eklendi
import LatestThree from "@/components/blog/LatestThree";
import { getTranslations } from "next-intl/server";

export default async function Page() {
	const t = await getTranslations("marketing.home");
  return (
    <MarketingLayout>
      <Hero />
     {/* <QuickActions /> */}
      <ProductGrid />
      <NewsLatestThree title={t("newsTitle")} />
      <LatestThree />
    </MarketingLayout>
  );
}
