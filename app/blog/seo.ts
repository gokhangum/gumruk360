// app/blog/seo.ts
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
/** Build absolute URL using request host; https for non-local */
export async function absUrl(path: string = "/") {
  const hdrs = await headers();
  const self = hdrs.get("x-canonical-url"); // middleware bu header'ı tam URL olarak set ediyorsa onu baz al
  if (self) {
    const u = new URL(self);
    return new URL(path.startsWith("/") ? path : `/${path}`, `${u.protocol}//${u.host}`).toString();
  }
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "localhost:3000";
  const proto =
    hdrs.get("x-forwarded-proto") ||
    (/^(localhost|127\.0\.0\.1)/i.test(host) ? "http" : "https");
  return new URL(path.startsWith("/") ? path : `/${path}`, `${proto}://${host}`).toString();
}

/** Blog detail için Schema.org BlogPosting JSON-LD üretimi */
export async function blogPostingJsonLd(opts: {
  url: string;
  headline: string;
  description: string;
  images?: string[];
  datePublished?: string;
  dateModified?: string;
  inLanguage?: string;  // "tr-TR"
  author?: string;
  publisher?: { name: string; logo: string };
}): Promise<any> { 
  const {
    url,
    headline,
    description,
    images = [],
    datePublished,
    dateModified,
        inLanguage = "tr-TR",
    author,
    publisher,
  } = opts;

  const t = await getTranslations("Seo");
  const authorName = author ?? t("siteName");
  const effectivePublisher = {
    name: publisher?.name ?? t("siteName"),
    logo: publisher?.logo ?? (await absUrl("/images/logo.png")),
  };

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "mainEntityOfPage": { "@type": "WebPage", "@id": url },
    "headline": headline,
    "description": description,
    "image": images,
    "datePublished": datePublished,
    "dateModified": dateModified ?? datePublished,
    "author": { "@type": "Organization", "name": authorName },
    "publisher": {
      "@type": "Organization",
      "name": effectivePublisher.name,
      "logo": { "@type": "ImageObject", "url": effectivePublisher.logo }
    },
    "inLanguage": inLanguage
  };
}

/** Blog liste sayfası için ItemList JSON-LD */
export function itemListJsonLd(opts: {
  title: string;
   description?: string;
   items: Array<{ url: string; name: string; image?: string; datePublished?: string }>;
  inLanguage?: string; // "tr-TR"
 }) {
   const { title, description, items = [], inLanguage = "tr-TR" } = opts ?? ({} as any);
   const safeItems = Array.isArray(items) ? items : [];
  return {
     "@context": "https://schema.org",
   "@type": "ItemList",
    name: title,
    description,
     inLanguage,
     itemListElement: safeItems.map((it, i) => ({
      "@type": "ListItem",
       position: i + 1,
     item: {
        "@type": "BlogPosting",
         headline: it.name,
        url: it.url,
       ...(it.image ? { image: [it.image] } : {}),
       ...(it.datePublished ? { datePublished: it.datePublished } : {})
      }
    }))
  };
 }
// Liste sayfası için başlık ve açıklama (i18n)
export async function getListTitle() {
  const t = await getTranslations("Seo");
  return t("listTitle");
}
export async function getListDescription() {
  const t = await getTranslations("Seo");
  return t("listDescription");
}



