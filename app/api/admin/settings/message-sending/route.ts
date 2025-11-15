  import { NextResponse } from "next/server";
  import { createClient } from "@supabase/supabase-js";
  
  // [YENİ] Global flag tek satırdan yönetiliyor.
  const FLAG_ID = "worker_messaging"; // ← Feature flags tablosunda tuttuğumuz tek anahtar
  
  // [YENİ] Route çıktılarının cache'lenmesini önle
  export const dynamic = "force-dynamic";
  export const revalidate = 0;
 
 function getAdminClient() {
   const url =
     process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
   const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
   if (!url || !serviceKey) return null;
   return createClient(url, serviceKey, { auth: { persistSession: false } });
 }
 
 function getAnonClient() {
   const url =
     process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
   const anon =
     process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
   if (!url || !anon) return null;
   return createClient(url, anon, { auth: { persistSession: false } });
 }
 
 export async function GET() {
   try {
     // Öncelik: service role ile kesin okuma
     const admin = getAdminClient();
     if (admin) {
       const { data, error } = await admin
         .from("feature_flags")
         .select("worker_messaging_enabled")
         .eq("id", FLAG_ID)                    // [DEĞİŞTİ] id="default" yerine tek anahtar
         .maybeSingle();
      if (error) throw error;
       const workerMessagingEnabled = data?.worker_messaging_enabled ?? true;
       const res = NextResponse.json({
         ok: true,
         data: { workerMessagingEnabled },
       });
       res.headers.set("Cache-Control", "no-store"); // [YENİ]
       return res;
    }
 
     // Service role yoksa: anon ile sadece okuma dene
     const anon = getAnonClient();
    if (anon) {
       const { data, error } = await anon
         .from("feature_flags")
         .select("worker_messaging_enabled")
         .eq("id", FLAG_ID)                    // [DEĞİŞTİ]
         .maybeSingle();
       if (!error) {
         const workerMessagingEnabled = data?.worker_messaging_enabled ?? true;
         const res = NextResponse.json({
           ok: true,
           data: { workerMessagingEnabled },
           note: "read_via_anon",
         });
        res.headers.set("Cache-Control", "no-store"); // [YENİ]
         return res;
       }
     }
 
     // Son çare: güvenli varsayılan (UI kırılmasın)
     const fallback = NextResponse.json({
       ok: true,
       data: { workerMessagingEnabled: true },
       warning: "missing_env_for_read",
     });
     fallback.headers.set("Cache-Control", "no-store"); // [YENİ]
    return fallback;
   } catch (e: any) {
     return NextResponse.json(
       { ok: false, error: e?.message || "read_failed" },
       { status: 500 }
     );
   }
 }
 
 export async function POST(req: Request) {
   try {
     const admin = getAdminClient();
     if (!admin) {
       return NextResponse.json(
         { ok: false, error: "missing_service_role_env" },
         { status: 500 }
       );
     }
 
     const body = await req.json().catch(() => ({}));
     const enabled = !!body?.enabled;
 
     const { data, error } = await admin
       .from("feature_flags")
       .upsert(
         { id: FLAG_ID, worker_messaging_enabled: enabled }, // [DEĞİŞTİ]
         { onConflict: "id" }
       )
       .select("worker_messaging_enabled")
       .single();
     if (error) throw error;
 
     const res = NextResponse.json({
       ok: true,
       data: { workerMessagingEnabled: !!data.worker_messaging_enabled },
     });
     res.headers.set("Cache-Control", "no-store"); // [YENİ]
     return res;
   } catch (e: any) {
     return NextResponse.json(
       { ok: false, error: e?.message || "write_failed" },
       { status: 500 }
     );
   }
 }
