// app/api/auth/signout/route.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: async (name: string) => cookieStore.get(name)?.value,
        set: async (name: string, value: string, options: any) => {
          cookieStore.set({ name, value, ...options });
        },
        remove: async (name: string, options: any) => {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );

  // server-side sign out: SSR çerezlerini de temizler
  await supabase.auth.signOut();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
