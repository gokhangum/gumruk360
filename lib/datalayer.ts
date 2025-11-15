// lib/datalayer.ts
// Additive: simple helper to push context to dataLayer on route changes
'use client';
export type PageContext = {
  host?: string;
  tenant?: string;
  locale?: string;
  userRole?: string;
  path?: string;
};
export function pushPageContext(ctx: PageContext) {
  try {
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event: 'page_context', ...ctx });
  } catch {}
}
