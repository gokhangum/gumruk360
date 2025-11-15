import React from "react";

type PreloadItem = {
  href: string;
  as: "font" | "image" | "script" | "style";
  type?: string;
  crossOrigin?: "anonymous" | "use-credentials";
  fetchPriority?: "high" | "low" | "auto";
  imagesrcset?: string;
  imagesizes?: string;
};

export default function PerfHead({
  gtmEnabled = false,
  extraPreloads = [],
}: {
  gtmEnabled?: boolean;
  extraPreloads?: PreloadItem[];
}) {
  return (
    <>
      <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
      <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
      <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />

      {gtmEnabled && (
        <>
          <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
          <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="" />
          <link rel="dns-prefetch" href="https://www.google-analytics.com" />
          <link rel="preconnect" href="https://www.google-analytics.com" crossOrigin="" />
        </>
      )}

      {extraPreloads.map((p, i) => (
        <link
          key={i}
          rel="preload"
          href={p.href}
          as={p.as}
          {...(p.type ? { type: p.type } : {})}
          {...(p.crossOrigin ? { crossOrigin: p.crossOrigin } : {})}
          {...(p.fetchPriority ? { fetchPriority: p.fetchPriority } : {})}
          {...(p.imagesrcset ? { imagesrcset: p.imagesrcset } as any : {})}
          {...(p.imagesizes ? { imagesizes: p.imagesizes } as any : {})}
        />
      ))}
    </>
  );
}
