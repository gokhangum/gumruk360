export const runtime = "nodejs";

import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations();

  const homeHref = "/";
  const contactHref = "/contact";

  return (
    <main className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-xl w-full text-center space-y-4">
        <div className="text-3xl font-bold">{t("notFound.title")}</div>
        <p className="text-muted-foreground">{t("notFound.body")}</p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link href={homeHref} className="px-4 py-2 rounded-xl border">{t("notFound.actions.home")}</Link>
          <Link href={contactHref} className="px-4 py-2 rounded-xl border">{t("notFound.actions.contact")}</Link>
        </div>
      </div>
    </main>
  );
}
