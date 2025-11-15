"use client";
import { resolvePublicUrl } from "@/lib/storage/resolvePublicUrl";
type Post = {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
  cover_image_path?: string | null;
  lang?: string | null;
  tags?: string[] | null;
  author_name?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
};
function getEnvBase() {
  const tr = process.env.NEXT_PUBLIC_APP_BASE_URL_TR || "";
  const en = process.env.NEXT_PUBLIC_APP_BASE_URL_EN || "";
  const trHost = tr ? new URL(tr).hostname : "";
  const enHost = en ? new URL(en).hostname : "";
  return { trBase: tr, enBase: en, trHost, enHost };
}

function normalizeLang(code?: string | null) {
  const s = (code || "tr-TR").trim();
  if (/^[a-z]{2}$/i.test(s)) {
    const lower = s.toLowerCase();
    if (lower === "en") return "en-US";
    if (lower === "tr") return "tr-TR";
  }
  return s;
}

function hostBrand() {
  const { trBase, enBase, trHost, enHost } = getEnvBase();
  const host = (typeof window !== "undefined" && window.location?.hostname) || "";

  // Öncelik: ENV’deki host eşleşmeleri
  if (enHost && host === enHost) {
    return { brandName: "EasyCustoms360", baseUrl: enBase || "" };
  }
  if (trHost && host === trHost) {
    return { brandName: "Gümrük360", baseUrl: trBase || "" };
  }

  // Fall-back: host eşleşmiyorsa TR’yi tercih et; yoksa EN; yoksa boş
  if (trBase) return { brandName: "Gümrük360", baseUrl: trBase };
  if (enBase) return { brandName: "EasyCustoms360", baseUrl: enBase };
  return { brandName: "Gümrük360", baseUrl: "" };
}

function publisherLogoUrl() {
  const { baseUrl } = hostBrand();
  return new URL("/images/logo.png", baseUrl).toString();
}


function absUrl(path: string) {
  const { baseUrl } = hostBrand();
  if (/^https?:\/\//i.test(path)) return path;
  return baseUrl + (path.startsWith("/") ? path : "/" + path);
}

function blogPostingJsonLd(p: Post) {
  const images = p.cover_image_path ? [resolvePublicUrl(p.cover_image_path)!] : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": p.title,
	"inLanguage": normalizeLang(p.lang || (typeof navigator !== "undefined" ? navigator.language : "tr-TR")),
    ...(images ? { "image": images } : {}),
    "datePublished": p.published_at || p.updated_at || new Date().toISOString(),
    "dateModified": p.updated_at || p.published_at || new Date().toISOString(),
    ...(p.summary ? { "description": p.summary } : {}),
    ...(p.tags && p.tags.length ? { "keywords": p.tags.join(", ") } : {}),
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": absUrl(`/blog/${encodeURIComponent(p.slug)}`)
    },
    "author": {
      "@type": "Person",
      "name": p.author_name || hostBrand().brandName
    },
    "publisher": {
      "@type": "Organization",
      "name": hostBrand().brandName,
      "logo": { "@type": "ImageObject", "url": publisherLogoUrl() }
    }
  };
}

/** Drop-in component: place inside blog detail page JSX */
export default function BlogJsonLd({ post }: { post: Post }) {
  const json = blogPostingJsonLd(post);
  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
