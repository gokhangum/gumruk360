// app/unauthorized/page.tsx
import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

// Host'a göre marka/başlık üret
function getBrandFromHost(host?: string) {
  const h = (host || "").toLowerCase();

  // Prod alan adları
  if (h.includes("gumruk360.com")) return { name: "Gümrük360", short: "Gümrük360" };
  if (h.includes("easycustoms360.com")) return { name: "EasyCustoms360", short: "EasyCustoms360" };

  // Lokal geliştirme: localhost = TR (Gümrük360), 127.0.0.1 = EN (EasyCustoms360)
  if (h.includes("localhost")) return { name: "Gümrük360", short: "Gümrük360" };
  if (h.includes("127.0.0.1")) return { name: "EasyCustoms360", short: "EasyCustoms360" };

  return { name: "Gümrük360", short: "Gümrük360" };
}

 export async function generateMetadata() {
   const hdrs = await headers();
   const host = hdrs.get("host") || "";
   const brand = getBrandFromHost(host);
  const t = await getTranslations("unauthorized");
  return {
    title: t("metaTitle", { brand: brand.short }),
    description: t("metaDesc"),
  };
}

// searchParams.next, middleware'de zaten hesaplayıp gönderiyorsunuz
 export default async function UnauthorizedPage({
   searchParams,
 }: {
   searchParams: Promise<{ next?: string }>;
 }) {
  const hdrs = await headers();
  const host = hdrs.get("host") || "";
  const brand = getBrandFromHost(host);
 const t = await getTranslations("unauthorized");

 const { next } = await searchParams;
 const nextParam = encodeURIComponent(next || "/");

  return (
    <main className="min-h-[70vh] w-full flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-2 h-10 w-10 rounded-full border border-gray-200 flex items-center justify-center">
            <span className="text-xl">🚫</span>
          </div>
          <h1 className="text-xl font-semibold">
            {t("heading", { brand: brand.name })}
          </h1>
          <p className="mt-2 text-sm text-gray-600">{t("desc")}</p>
        </div>

        <div className="mt-6 space-y-3">
          <Link
            href={`/login?next=${nextParam}`}
            className="block w-full rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-medium hover:bg-gray-50"
          >
            {t("login")}
          </Link>
          <Link
            href={`/signup?next=${nextParam}`}
            className="block w-full rounded-xl bg-black px-4 py-2 text-center text-sm font-semibold text-white hover:opacity-90"
          >
            {t("signup")}
          </Link>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-xs text-gray-500 underline-offset-2 hover:underline"
          >
            {t("backHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}
