import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";


export default async function FaqPage() {

	const t = await getTranslations("faq");

return (
<div className="space-y-4">
<h1 className="text-xl font-semibold">{t("title")}</h1>

<p className="text-sm text-gray-600">{t("intro")}</p>



<div className="space-y-3">
<details className="rounded border p-3">
<summary className="cursor-pointer font-medium">{t("items.0.q")}</summary>

<p className="mt-2 text-sm text-gray-700">{t("items.0.a")}</p>

</details>
<details className="rounded border p-3">
<summary className="cursor-pointer font-medium">{t("items.1.q")}</summary>

<p className="mt-2 text-sm text-gray-700">{t("items.1.a")}</p>

</details>
</div>
</div>
);
}