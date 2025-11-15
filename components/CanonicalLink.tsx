// /components/CanonicalLink.tsx
import { headers } from "next/headers";

export default async function CanonicalLink() {
  const h = await headers();
  // middleware'den gelen normalize edilmiş, query'siz self URL
  const self = h.get("x-canonical-url") || "";

  // Güvenlik: boşsa hiçbir şey basma
  if (!self) return null;

  return <link rel="canonical" href={self} />;
}
