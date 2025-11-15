// lib/supabaseServer.ts
import { supabaseServer as realSupabaseServer } from './supabase/server'

/** Uyum katmanı: Eski kod `supabaseServer()` beklediğinden fonksiyon döndürüyoruz. */
export async function supabaseServer() {
  return await realSupabaseServer()
}


// İhtiyaç duyan dosyalar için aynen açık veriyoruz


// Bazı import stilleri default bekleyebilir
export default supabaseServer
