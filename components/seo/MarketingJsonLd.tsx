"use client";
type Props = { jsonld?: any };
export default function MarketingJsonLd({ jsonld }: Props) {
  if (!jsonld) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />;
}
