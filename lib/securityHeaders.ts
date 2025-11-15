export function buildSecurityHeaders(opts?: {
  isHttps?: boolean;
  isProd?: boolean;
  reportOnly?: boolean; 
  cspExtraScriptSrc?: string[];
  cspExtraConnectSrc?: string[];
  cspExtraImgSrc?: string[];
  cspExtraStyleSrc?: string[];
  cspExtraFrameSrc?: string[];
}) {
  const isHttps = !!opts?.isHttps;
  const isProd = !!opts?.isProd;

  const cspParts: string[] = [];
  cspParts.push("default-src 'self'");
  cspParts.push("base-uri 'self'");
  cspParts.push("form-action 'self'");
    cspParts.push("frame-ancestors 'none'");
  cspParts.push("object-src 'none'");

  const scriptSrc = [
    "'self'",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    ...(opts?.cspExtraScriptSrc || []),
  ];
  cspParts.push("script-src " + scriptSrc.join(" "));

  const connectSrc = [
    "'self'",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    ...(opts?.cspExtraConnectSrc || []),
  ];
  cspParts.push("connect-src " + connectSrc.join(" "));

  const imgSrc = [
    "'self'",
    "data:",
    "https:",
    ...(opts?.cspExtraImgSrc || []),
  ];
  cspParts.push("img-src " + imgSrc.join(" "));

  const styleSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://fonts.googleapis.com",
    ...(opts?.cspExtraStyleSrc || []),
  ];
  cspParts.push("style-src " + styleSrc.join(" "));

  const fontSrc = [
    "'self'",
    "https://fonts.gstatic.com",
    "data:",
  ];
  cspParts.push("font-src " + fontSrc.join(" "));

  const frameSrc = [
    "'self'",
    "https://www.googletagmanager.com",
    ...(opts?.cspExtraFrameSrc || []),
  ];

  cspParts.push("frame-src " + frameSrc.join(" "));

  if (isHttps && isProd) {
    cspParts.push("upgrade-insecure-requests");
  }


  const headers: Record<string, string> = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "geolocation=(), microphone=(), camera=(), payment=(), interest-cohort=(), browsing-topics=()",
    ...(opts?.reportOnly
    ? { "Content-Security-Policy-Report-Only": cspParts.join("; ") }
  : { "Content-Security-Policy": cspParts.join("; ") }
),

  };

  // 🔒 Test dönemi no-index: Vercel ENV -> disable_indexing=1 (veya DISABLE_INDEXING=1)
  const noindexFlag =
    process.env.disable_indexing === "1" || process.env.DISABLE_INDEXING === "1";
  if (noindexFlag) {
    headers["X-Robots-Tag"] = "noindex, nofollow, noarchive, nosnippet";
  }

  if (isHttps && isProd) {
    const maxAge = Number(process.env.HSTS_MAX_AGE || 31536000); // 1 yıl varsayılan
    const preload = process.env.HSTS_PRELOAD === "1";
    headers["Strict-Transport-Security"] =
      `max-age=${maxAge}; includeSubDomains${preload ? "; preload" : ""}`;
  }

  return headers;
}

