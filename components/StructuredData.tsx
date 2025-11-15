// /components/StructuredData.tsx
import { headers } from "next/headers";
import { tenantFromHost, brandName } from "@/lib/brand";

const EXCLUDE_PREFIXES = ["/dashboard", "/admin", "/api", "/_next", "/auth"];

function shouldExclude(path: string) {
  return EXCLUDE_PREFIXES.some((p) => path.startsWith(p));
}

function buildBreadcrumb(path: string, origin: string) {
  // Public rotalarda breadcrumb üret (home + segmentler)
  // Örn: /about -> Home > About
  const segments = path.split("/").filter(Boolean);
  const items = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: origin + "/",
    },
  ];

  let cur = "";
  segments.forEach((seg, idx) => {
    cur += `/${seg}`;
    // Basit bir adlandırma; istersen mapping ekleyebilirsin:
    const nameMap: Record<string, string> = {
      about: "About",
      faq: "FAQ",
      contact: "Contact",
      legal: "Legal",
      // TR için istersen buraya TR karşılıklarını koyabilirsin (schema'da dil önemli değil)
    };
    const name = nameMap[seg] || seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({
      "@type": "ListItem",
      position: idx + 2,
      name,
      item: origin + cur,
    });
  });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

export default async function StructuredData() {
  const h = await headers();
  const self = h.get("x-canonical-url");
  const host = h.get("host") || "";

  if (!self || !host) return null;

  const url = new URL(self);
  const path = url.pathname;
  const isPrivate = shouldExclude(path);
  if (isPrivate) return null;

  const tenant = tenantFromHost(host);
  const brand = brandName(tenant);

  // Tenant'a göre marka varlıkları
  const ORG = {
    TR: {
      legalName: "Gümrük360",
      logo: "https://gumruk360.com/images/logo.png",
      sameAs: [
        "https://gumruk360.com",
      ],
    },
    EN: {
      legalName: "EasyCustoms360",
      logo: "https://tr.easycustoms360.com/images/logo.png",
      sameAs: [
        "https://tr.easycustoms360.com",
      ],
    },
  } as const;

  const org = ORG[tenant];

  const origin = `${url.protocol}//${url.host}`;

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand,
    legalName: org.legalName,
    url: origin,
    logo: org.logo,
    sameAs: org.sameAs,
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "Website",
    name: brand,
    url: origin,
  };

  const breadcrumb = buildBreadcrumb(path, origin);

  return (
    <>
      <script
        type="application/ld+json"
        // @ts-ignore
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        // @ts-ignore
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
      {/* Breadcrumb sadece public rotalarda */}
      {path !== "/" && (
        <script
          type="application/ld+json"
          // @ts-ignore
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
        />
      )}
    </>
  );
}
