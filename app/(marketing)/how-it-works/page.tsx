import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";


export default async function HowItWorksPage() {
	const t = await getTranslations("howItWorks");
return (
<div className="space-y-4">
<h1 className="text-xl font-semibold">{t("title")}</h1>

</div>
);
}