// /components/HreflangLinks.tsx
import { headers } from "next/headers";

// Marka/tenant ana alanları:
const HOST_TR = "gumruk360.com";           // TR tenant apex
const HOST_EN = "tr.easycustoms360.com";   // EN tenant apex

export default async function HreflangLinks() {
  const h = await headers();

  // A1 + canonical patch'ten gelen, query’siz self URL
  const self = h.get("x-canonical-url");
  if (!self) return null;

  const url = new URL(self);
  const path = url.pathname; // query yok; A1 temizliyor

  // Mevcut host'a bakıp "diğer" tenant URL'lerini kur
  // Not: path iki dilde de eş (pazarlama rotaları ortak)
  const trUrl = `https://${HOST_TR}${path}`;
  const enUrl = `https://${HOST_EN}${path}`;

  // x-default stratejisi: EN'i x-default yapıyoruz (istersen TR yapabilirsin)
  return (
    <>
      <link rel="alternate" hrefLang="tr-TR" href={trUrl} />
      <link rel="alternate" hrefLang="en" href={enUrl} />
      <link rel="alternate" hrefLang="x-default" href={enUrl} />
    </>
  );
}
