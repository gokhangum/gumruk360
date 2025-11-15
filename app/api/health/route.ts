import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function mask(val?: string, keepStart=4, keepEnd=4) {
  if (!val) return null;
  if (val.length <= keepStart + keepEnd) return "***";
  return `${val.slice(0, keepStart)}…${val.slice(-keepEnd)}`;
}

export async function GET() {
  const nodeEnv    = process.env.NODE_ENV;
  const vercelEnv  = process.env.VERCEL_ENV; // "production" beklenir
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  // Basit ortam tutarlılık kontrolleri
  const urlOk   = url.startsWith("https://") && url.includes(".supabase.co");
  const anonOk  = anonKey.length > 40;               // kaba uzunluk kontrolü
  const srvOk   = serviceKey.length > 40;            // sadece server’da
  const srvLeakedToClient = false;                   // bilinçli sabit: client’ta asla kullanılmamalı

  // Server-side Supabase client (service role ile)
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // 1) Ping (fonksiyonla DB erişimi)
  let ping: any = null, pingErr: any = null;
  try {
    const { data, error } = await supabase.rpc("health_ping");
    ping = data ?? null;
    pingErr = error ? { message: error.message, code: (error as any).code } : null;
  } catch (e: any) {
    pingErr = { message: e?.message || "rpc failed" };
  }

  // 2) Basit tabloya HEAD count (RLS/bağlantı kontrolü)
  // Varlığını bildiğiniz, okuması güvenli bir tablo adı koyabilirsiniz (ör: blog_posts).
  // HEAD + count gerçek satır döndürmez, sadece bağlantı/izin sinyali verir.
  let headOk: boolean | null = null;
  let headErr: any = null;
  try {
    const { count, error } = await supabase
      .from("blog_posts")             // yoksa bildiğiniz güvenli tabloyu yazın
      .select("*", { count: "exact", head: true });
    headOk = error ? false : true;
    headErr = error ? { message: error.message, code: (error as any).code } : null;
  } catch (e: any) {
    headOk = false;
    headErr = { message: e?.message || "head failed" };
  }

  // 3) PROD’a özgü beklenenler
  const expectedProd =
    nodeEnv === "production" &&
    vercelEnv === "production" &&
    urlOk && anonOk && srvOk &&
    ping === "ok" &&
    headOk === true;

  return NextResponse.json({
    env: {
      nodeEnv, vercelEnv,
      disableIndexing: process.env.DISABLE_INDEXING === "1",
    },
    supabase: {
      urlHost: url ? new URL(url).host : null,
      anonKeyMasked: mask(anonKey),
      serviceKeyMasked: mask(serviceKey),
      urlOk, anonOk, srvOk,
      srvLeakedToClient, // her zaman false beklenir
      ping, pingErr,
      headOk, headErr,
    },
    verdict: expectedProd ? "PROD_OK" : "CHECK_FLAGS",
  }, { status: expectedProd ? 200 : 503 });
}
