export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * /logout
 * - Supabase oturumunu güvenli şekilde kapatır
 * - admin_secret çerezini temizler
 * - /login sayfasına yönlendirir
 *
 * Next.js 15.5.2 (Turbopack) uyumludur.
 * cookies() çağrısı await ile kullanılmaktadır.
 */
export async function GET(request: Request) {
 const hdrHost = request.headers.get("x-forwarded-host")
  ?? request.headers.get("host")
  ?? new URL(request.url).host;

const hdrProto = request.headers.get("x-forwarded-proto")
  ?? new URL(request.url).protocol.replace(":", "");

const loginAbs = `${hdrProto}://${hdrHost}/login`;
const response = NextResponse.redirect(loginAbs);

  
  // Supabase SSR client: cookies() mutlaka await edilmeli
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // no-op
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // no-op
          }
        },
      },
    }
  );

  // Oturumu kapat
  try {
    await supabase.auth.signOut();
  } catch {
    // hata olsa da sessizce devam ediyoruz
  }

  // Admin girişlerinde kullanılan gizli anahtar çerezini de temizle
  try {
    response.cookies.set("admin_secret", "", { expires: new Date(0), path: "/" });
  } catch {
    // no-op
  }

  return response;
}
