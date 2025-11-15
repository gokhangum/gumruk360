// /lib/urlPolicy.ts
import type { NextRequest } from "next/server";

const PRIMARY_HOSTS = new Set([
  "gumruk360.com",
  "tr.easycustoms360.com",
]);

const WWW_COMPAT = new Set([
  "www.gumruk360.com",
  "www.tr.easycustoms360.com",
]);

const EXCLUDE_PREFIXES = [
  "/_next", "/api", "/assets", "/fonts", "/images", "/favicon", "/og", "/twitter"
];

const FILE_EXTENSIONS = [
  ".png",".jpg",".jpeg",".webp",".svg",".ico",".gif",".pdf",
  ".js",".mjs",".cjs",".css",".map",".txt",".xml",".json",".zip",".rar",".woff",".woff2",".ttf",".otf"
];

const TRACKING_PARAMS = new Set([
  "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
  "gclid","fbclid","yclid","msclkid","utm_id","utm_referrer","ref"
]);

function hasFileExtension(pathname: string) {
  return FILE_EXTENSIONS.some(ext => pathname.toLowerCase().endsWith(ext));
}

function isExcludedPath(pathname: string) {
  return EXCLUDE_PREFIXES.some(p => pathname.startsWith(p));
}

function normalizePath(pathname: string) {
  if (pathname === "/") return "/";
  let out = pathname;
  if (out.endsWith("/")) out = out.slice(0, -1);
  if (!hasFileExtension(out)) out = out.toLowerCase();
  if (out.length === 0) out = "/";
  return out;
}

function stripTrackingParams(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  let changed = false;
  for (const key of Array.from(q.keys())) {
    const val = q.get(key);
    if (val === "" || TRACKING_PARAMS.has(key)) {
      q.delete(key);
      changed = true;
    }
  }
  return changed;
}

export type UrlPolicyDecision =
  | { action: "pass" }
  | { action: "redirect"; location: string; status: 308 };

export function applyUrlPolicy(req: NextRequest): UrlPolicyDecision {
  const url = req.nextUrl;
  const hostname = url.hostname.toLowerCase();

  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  const rawPath = url.pathname;
  if (isExcludedPath(rawPath)) {
    const qpChanged = stripTrackingParams(req);
    if (qpChanged) {
      const clean = new URL(url.toString());
      return { action: "redirect", location: clean.toString(), status: 308 };
    }
    return { action: "pass" };
  }

  if (WWW_COMPAT.has(hostname)) {
    const targetHost = hostname.replace(/^www\./, "");
    const redirected = new URL(url.toString());
    redirected.hostname = targetHost;
    if (!isLocal) redirected.protocol = "https:";
    return { action: "redirect", location: redirected.toString(), status: 308 };
  }

  const isPrimary = PRIMARY_HOSTS.has(hostname) || isLocal;
  if (!isPrimary) {
    // Gerekirse burada primary'e taşınabilir.
  }

  if (!isLocal && url.protocol !== "https:") {
    const redirected = new URL(url.toString());
    redirected.protocol = "https:";
    return { action: "redirect", location: redirected.toString(), status: 308 };
  }

  let normalizedPath = rawPath;
  if (!hasFileExtension(rawPath)) {
    normalizedPath = normalizePath(rawPath);
  }

  const qpChanged = stripTrackingParams(req);

  if (normalizedPath !== rawPath || qpChanged) {
    const redirected = new URL(url.toString());
    redirected.pathname = normalizedPath;
    return { action: "redirect", location: redirected.toString(), status: 308 };
  }

  return { action: "pass" };
}
