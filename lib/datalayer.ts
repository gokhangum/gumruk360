// lib/datalayer.ts
"use client";

export type PageContext = {
  host?: string;
  tenant?: string;
  locale?: string;
  userRole?: string;
  path?: string;
};

declare global {
  interface Window {
    dataLayer?: any[];
  }
}

function safeDataLayerPush(payload: any) {
  try {
    if (typeof window === "undefined") return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  } catch {
    // errors swallow
  }
}

export function pushPageContext(ctx: PageContext) {
  safeDataLayerPush({ event: "page_context", ...ctx });
}

export function pushEvent(eventName: string, params: Record<string, any> = {}) {
  safeDataLayerPush({ event: eventName, ...params });
}
