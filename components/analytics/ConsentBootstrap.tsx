// components/analytics/ConsentBootstrap.tsx
// Additive: injects Consent Mode v2 defaults (denied) + dataLayer bootstrap
// Usage: place inside <head> of your root layout (marketing + app shell if needed)
import React from "react";

export default function ConsentBootstrap() {
  const script = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent', 'default', {
      'ad_storage': 'denied',
      'analytics_storage': 'denied',
      'ad_user_data': 'denied',
      'ad_personalization': 'denied',
      'wait_for_update': 500
    });
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
