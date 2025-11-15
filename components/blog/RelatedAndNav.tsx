
import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations, getLocale } from "next-intl/server";
 async function absFetchPath(path: string) {
   const hdrs = await headers();
   const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "localhost:3000";
   const proto =
     hdrs.get("x-forwarded-proto") ||
     (/^(localhost|127\.0\.0\.1)/i.test(host) ? "http" : "https");
   const base = `${proto}://${host}`;
  return new URL(path, base).toString();
}

async function fetchDetail(slug: string) {
  const res = await fetch(await absFetchPath(`/blog/_detail/${encodeURIComponent(slug)}`), { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

/** Server Component
 * Kullanım (detay sayfada):
 *   <RelatedAndNav slug={slug} />
 */
export default async function RelatedAndNav({ slug }: { slug: string }) {
  const json = await fetchDetail(slug);
  if (!json) return null;
  const { prev, next, related } = json;
  const t = await getTranslations("RelatedAndNav");
  const locale = await getLocale();
  return (
    <section className="mt-10 grid gap-6">
      {/* Prev / Next */}
      <nav className="flex items-center justify-between gap-4">
        <div className="flex-1">
          {prev ? (
            <Link href={`/blog/${prev.slug}`} className="block p-3 border rounded-xl hover:bg-gray-50">
             <div className="text-xs text-gray-500">{t("prev")}</div>
              <div className="text-sm font-medium line-clamp-2">{prev.title}</div>
            </Link>
          ) : <span />}
        </div>
        <div className="flex-1 text-right">
          {next ? (
            <Link href={`/blog/${next.slug}`} className="block p-3 border rounded-xl hover:bg-gray-50">
              <div className="text-xs text-gray-500">{t("next")}</div>
              <div className="text-sm font-medium line-clamp-2">{next.title}</div>
            </Link>
          ) : <span />}
        </div>
      </nav>

      {/* Related */}
      {Array.isArray(related) && related.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-2">{t("relatedHeading")}</h3>
          <ul className="grid md:grid-cols-2 gap-3">
            {related.map((p: any) => (
              <li key={p.id} className="border rounded-xl p-3 hover:bg-gray-50">
                <Link href={`/blog/${p.slug}`} className="block">
                  <div className="text-sm font-medium line-clamp-2">{p.title}</div>
                 <div className="text-xs text-gray-500 mt-1">
                    {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(p.updated_at))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
