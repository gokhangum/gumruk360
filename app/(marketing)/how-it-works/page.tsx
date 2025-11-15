import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";


export default async function HowItWorksPage() {
	const t = await getTranslations("howItWorks");
return (
<div className="space-y-4">
<h1 className="text-xl font-semibold">{t("title")}</h1>

<p className="text-sm text-gray-600">{t("intro")}</p>

<ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
<li>{t("steps.0")}</li>
<li>{t("steps.1")}</li>
<li>{t("steps.2")}</li>

</ul>
</div>
);
}