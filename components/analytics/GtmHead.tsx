// components/analytics/GtmHead.tsx
// Additive: injects GTM <script> in <head> and <noscript> iframe in <body> (optional)
// Use disabled flag for staging/local environments
import React from "react";

type Props = {
  gtmId?: string | null;
  disabled?: boolean;
  includeNoScript?: boolean; // add body noscript (if you also render this in <body>)
};

export function GtmHead({ gtmId, disabled }: Props) {
  if (!gtmId || disabled) return null;
  const code = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','${gtmId}');`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

export function GtmNoScript({ gtmId, disabled }: Props) {
  if (!gtmId || disabled) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}
