import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";
import { applyUrlPolicy } from "@/lib/urlPolicy";
import { buildSecurityHeaders } from "@/lib/securityHeaders";
// Vary header’ını güvenli şekilde biriktir
 function setVary(res: NextResponse, addLang = true) {
  const prev = res.headers.get("Vary");
  const additions = addLang ? "Host, Accept-Language" : "Host";
  if (!prev) {
    res.headers.set("Vary", additions);
  } else {
    const v = new Set(prev.split(",").map((s) => s.trim()).filter(Boolean));
   additions.split(",").forEach((s) => v.add(s.trim()));
    res.headers.set("Vary", Array.from(v).join(", "));
  }
 }
function applySecurityHeaders(req: NextRequest, res: NextResponse) {
  const url = new URL(req.url);
  const isHttps = url.protocol === "https:";
  const isProd =
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1" &&
    !url.hostname.endsWith(".local");

  // 🔐 Sadece PROD'da uygula; local/staging'de NO-OP
  if (!isProd) return res;

const sec = buildSecurityHeaders({
    isHttps,
    isProd,
    reportOnly: process.env.CSP_REPORT_ONLY === "1", // NEW

    // Paddle için gerekli CSP kaynakları
    cspExtraScriptSrc: [
      "https://cdn.paddle.com",
      "https://cdn.paddle.com/paddle" // v2 path dahil
    ],
    cspExtraFrameSrc: [
      "https://sandbox-buy.paddle.com", // Sandbox overlay/iframe
      "https://buy.paddle.com"          // Prod overlay/iframe
    ],
    cspExtraConnectSrc: [
      "https://*.paddle.com",
      "https://api.sandbox.paddle.com"
    ],
    cspExtraImgSrc: [
      "https://*.paddle.com"
    ],
  });

  for (const [k, v] of Object.entries(sec)) res.headers.set(k, v);
  return res;
}
// Worker Editor → /worker/editor/<uuid> kontrolü
const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isWorkerEditorPostToGpt(req: NextRequest) {
  if (req.method !== 'POST') return false

  // Sadece 3 butonun kullandığı 2 endpoint
  const pathname = req.nextUrl.pathname
  const isGptButtonsEndpoint =
    pathname === '/api/admin/gpt-answers/run' ||
    pathname === '/api/admin/gpt-answers/summarize'
  if (!isGptButtonsEndpoint) return false

  // Referer: /worker/editor/<uuid> olmalı
  const ref = req.headers.get('referer') || ''
  try {
    const u = new URL(ref)
    const m = u.pathname.match(/^\/worker\/editor\/([0-9a-f-]{36})(?:\/|$)/i)
    const id = m?.[1]
    return !!(id && UUID_RX.test(id))
  } catch {
    return false
  }
}


/** ADMIN doğrulama: header/cookie/query ile ADMIN_SECRET kontrolü */
function isAdminFromRequest(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;

  const fromHeader = req.headers.get("x-admin-secret");
  if (fromHeader && fromHeader === expected) return true;

  const fromCookie = req.cookies.get("admin_secret")?.value;
  if (fromCookie && fromCookie === expected) return true;

  // Sadece local/debug amaçlı: ?admin_secret=...
  const fromQuery = req.nextUrl.searchParams.get("admin_secret");
  if (process.env.NODE_ENV !== "production" && fromQuery && fromQuery === expected) return true;

  return false;
}

/** Supabase üzerinde kullanıcının rolünü oku (admin/worker/user) */
async function getUserRole(req: NextRequest, res: NextResponse) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            // NextRequest cookies API
            return req.cookies.getAll().map((c) => ({
              name: c.name,
              value: c.value,
            }));
          },
          setAll(cookiesToSet) {
            // Yanıta yaz (middleware ortamı)
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                res.cookies.set(name, value, options);
              });
            } catch {
              // no-op
            }
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Profilden rolü çek
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = (profile as any)?.role as "admin" | "worker" | "user" | undefined;
    return role ?? "user";
  } catch {
    return null;
  }
}

/**
 * Worker’ın kullanmasına izin verilen ADMIN soru API’leri (whitelist).
 */
function isWorkerAllowedAdminQuestionApi(pathname: string) {
  const UUID = "[0-9a-f\\-]{36}";
  const allow: string[] = [
    // Soru işlemleri
    `^/api/admin/questions/${UUID}/assign$`,
    `^/api/admin/questions/${UUID}/status$`,
    `^/api/admin/questions/${UUID}/claim$`,
    `^/api/admin/questions/${UUID}/answer-status$`,

    // Taslak & Revizyon
    `^/api/admin/questions/${UUID}/drafts$`,
    `^/api/admin/questions/${UUID}/latest$`,
	`^/api/admin/questions/${UUID}/revisions/latest$`,
    `^/api/admin/questions/${UUID}/revisions/ingest-draft$`,
	`^/api/admin/questions/${UUID}/revise-complete$`,

    // GPT ile taslak üretme
    `^/api/admin/questions/${UUID}/generate-draft$`,

    // Ekler — liste / upload / silme varyasyonları
    `^/api/admin/questions/${UUID}/attachments$`,
    `^/api/admin/questions/${UUID}/attachments/.*$`,
    `^/api/admin/questions/${UUID}/attachments/upload$`,
    `^/api/admin/questions/${UUID}/attachments/remove$`,

    // E-posta önizleme / gönderim
    `^/api/admin/questions/${UUID}/send/preview$`,
    `^/api/admin/questions/${UUID}/send$`,
    `^/api/admin/questions/${UUID}/mail/send$`,
  ];

  return allow.some((p) => new RegExp(p, "i").test(pathname));
}

export async function middleware(req: NextRequest) {
	// === G1 REDIRECTS: www→apex, http→https (prod) ===
 {

  // Host tespiti: x-forwarded-host > host; varsa portu temizle
   const xfHost = req.headers.get("x-forwarded-host")?.toLowerCase() || "";
  const rawHost = (xfHost || req.headers.get("host") || "").toLowerCase();
   const hostOnly = rawHost.replace(/:\d+$/, ""); // www.gumruk360.com:3000 → www.gumruk360.com

  const u = new URL(req.nextUrl);
  const urlHostOnly = (u.host || "").toLowerCase().replace(/:\d+$/, "");

   // local / dev tespiti: Host header'a göre (prod host simülasyonunu engellemesin)
   const isLocal =
     hostOnly === "localhost" ||
     hostOnly === "127.0.0.1" ||
     hostOnly.endsWith(".local");

   // Lokal test için https yönlendirmesini bypass edebilmek üzere opsiyonel parametre
   const bypassNoHttps = u.searchParams.has("__nohttps");
 
   // 1) www → apex (her ortamda; local testte de çalışsın)
   if (hostOnly === "www.gumruk360.com" || hostOnly === "www.tr.easycustoms360.com") {
     u.host = hostOnly.replace(/^www\./, "");
     return NextResponse.redirect(u, 308);
  }

   // 2) http → https (yalnız prod hostlarda ve bypass yokken)
  const isProdHost = hostOnly === "gumruk360.com" || hostOnly === "tr.easycustoms360.com";
  if (!isLocal && isProdHost && u.protocol === "http:" && !bypassNoHttps) {
    u.protocol = "https:";
     // local simülasyonda portu korumak için rawHost'u tekrar ata
    u.host = rawHost || hostOnly;
     return NextResponse.redirect(u, 308);
   }
 }


// === /G1 REDIRECTS ===

	  // A1 – URL POLICY (erken nokta; redirect gerekiyorsa hemen dön)
  {
    const decision = applyUrlPolicy(req);
    if (decision.action === "redirect") {
      return NextResponse.redirect(decision.location, { status: decision.status });
    }
  }
  // Canonical URL: A1 normalizasyonundan sonra, query'siz self URL'i request header'a koy
  const requestHeaders = new Headers(req.headers);
  {
const clean = new URL(req.nextUrl.toString());

// Host’u header’dan al
const hdrHost = req.headers.get("host") ?? clean.host;
const isLocalDev = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hdrHost);

// DEV’DE HOSTU AYNEN KORU (localhost ise localhost, 127 ise 127)
clean.protocol = isLocalDev ? "http:" : "https:";
clean.host = hdrHost;

// Canonical her zaman query’siz olmalı
clean.search = "";
clean.hash = "";

// Header’a yaz
requestHeaders.set("x-canonical-url", clean.toString());

    // Downstream'de headers() ile okunabilsin diye req.headers'ı da güncelliyoruz
 
  }
   if (isWorkerEditorPostToGpt(req)) {
    const resGpt = NextResponse.next({ request: { headers: requestHeaders }});
   setVary(resGpt);
     return resGpt;
  }
  // Webhook & mock bypass
  const WEBHOOK_BYPASS_PREFIXES = [
    "/api/payments/paytr/webhook",
    "/api/payments/mock/mark-paid",
  ] as const;

  const pathnameOnly = req.nextUrl.pathname;
  // PUBLIC: server-side email confirm
   if (pathnameOnly === "/auth/confirm") {
    // confirm dönüşünü engellemeyelim; session/cookie güncellensin
     const resForConfirm = NextResponse.next({ request: { headers: requestHeaders }}); 
	 setVary(resForConfirm);
const supaForConfirm = await updateSession(req);
for (const c of supaForConfirm.cookies.getAll()) resForConfirm.cookies.set(c);
return resForConfirm;
   }

  // [AUTH-GUARD] Public allowlist (login/signup/reset flow + homepage)
const PUBLIC_ALLOW: Array<string | RegExp> = [
  "/", "/login", "/signup", "/reset-password", "/redirect/me", "/unauthorized",
  /^\/auth\/reset$/, /^\/auth\/confirm\/info$/, /^\/auth\/debug$/, 
];

function isPublicPath(p: string) {
  return PUBLIC_ALLOW.some((pat) =>
    typeof pat === "string" ? pat === p : pat.test(p)
  );
}

// [AUTH-GUARD] Protected prefixes (require session)
const PROTECTED_PREFIXES: Array<string | RegExp> = [
  /^\/admin(\/|$)/,
  /^\/dashboard(\/|$)/,
  /^\/ask(\/|$)/,
  /^\/checkout(\/|$)/,
  /^\/worker(\/|$)/,
  /^\/attachments(\/|$)/,
  /^\/settings(\/|$)/,
  /^\/profile$/,              // single page
  /^\/api\/admin\/requests$/, // "sayfa" tipi /api rotası
];

const isProtectedPath = (p: string) =>
  PROTECTED_PREFIXES.some((rx) =>
    typeof rx === "string" ? p.startsWith(rx) : rx.test(p)
  );

// Public yollar: session yenile ve geç
if (isPublicPath(pathnameOnly)) {
  const resPublic = NextResponse.next({ request: { headers: requestHeaders }});
  setVary(resPublic);
const supaPublic = await updateSession(req);
for (const c of supaPublic.cookies.getAll()) resPublic.cookies.set(c);
applySecurityHeaders(req, resPublic);
return resPublic;
}

// Korumalı yollar: oturum yoksa /auth-required'a yönlendir
if (isProtectedPath(pathnameOnly)) {
  const res = NextResponse.next({ request: { headers: requestHeaders }});
  setVary(res);
  const role = await getUserRole(req, res);
  if (!role) {
    const url = req.nextUrl.clone();
    url.pathname = "/unauthorized";
    url.search = `?next=${encodeURIComponent(
      req.nextUrl.pathname + (req.nextUrl.search || "")
    )}`;
  const resRewrite = NextResponse.rewrite(url, { request: { headers: requestHeaders }});
  setVary(resRewrite);
  applySecurityHeaders(req, resRewrite);
  return resRewrite;
  }
}

  // Admin GPT Pricing secure bypass for internal server→server calls (ONLY this endpoint)
if (pathnameOnly === "/api/admin/gpt-pricing/estimate" && req.method === "POST") {
  const expected = process.env.INTERNAL_API_KEY;
  const got = req.headers.get("x-internal-key");
  if (expected && got && got === expected) {
    // Doğru internal anahtar ile gelen istekleri tamamen geçir
    return NextResponse.next({ request: { headers: requestHeaders }});
  }
  // Yanlış/eksik anahtar: normal admin kuralları çalışmaya devam etsin (bypass yapma)
}
  if (WEBHOOK_BYPASS_PREFIXES.some((p) => pathnameOnly.startsWith(p))) {
    return NextResponse.next({ request: { headers: requestHeaders }});
  }

  const res = NextResponse.next({ request: { headers: requestHeaders }});
  const { pathname, search } = req.nextUrl;

  const isAdminArea =
    (pathname.startsWith("/admin") && pathname !== "/admin/login") ||
    (pathname.startsWith("/api/admin") && pathname !== "/api/admin/login");

  if (isAdminArea) {
    // 1) SECRET ile tam eriş (CI/cron/script)
    if (isAdminFromRequest(req)) {
      return updateSession(req);
    }

    // 2) Rol bazlı izin
    const role = await getUserRole(req, res);

    if (role === "admin") {
      return updateSession(req);
    }

    if (role === "worker" && pathname.startsWith("/api/admin") && isWorkerAllowedAdminQuestionApi(pathname)) {
      return updateSession(req);
    }

    // 3) Yetkisiz: API için JSON 401; sayfa için login'e redirect
    if (pathname.startsWith("/api/")) {
     const jsonRes = NextResponse.json(
  { ok: false, error: "unauthorized", display: "Yetki yok (admin API)." },
  { status: 401 }
);
applySecurityHeaders(req, jsonRes);
return jsonRes;
    }

    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    const next = `${pathname}${search || ""}`;
    url.search = `?next=${encodeURIComponent(next)}`;
    const resRedirect = NextResponse.redirect(url);
applySecurityHeaders(req, resRedirect);
return resRedirect;
  }

  // Diğer yollar: Supabase session yenileme
const resFinal = NextResponse.next({ request: { headers: requestHeaders }});
setVary(resFinal);
const supaFinal = await updateSession(req);
for (const c of supaFinal.cookies.getAll()) resFinal.cookies.set(c);
applySecurityHeaders(req, resFinal);
return resFinal;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|opengraph-image|twitter-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
