// lib/auth/getAuthFromCookies.ts
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export type AuthInfo = {
  isAuth: boolean;
  userName?: string;
  userId?: string;
  email?: string;
};

export async function getAuthFromCookies(): Promise<AuthInfo> {
  try {
    // Next 15: cookies() async çağrılmalı
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          // Bu üç fonksiyonu async tutalım (Next 15 uyumlu)
          get: async (name: string) => {
            return cookieStore.get(name)?.value;
          },
          set: async (name: string, value: string, options: any) => {
            cookieStore.set({ name, value, ...options });
          },
          remove: async (name: string, options: any) => {
            cookieStore.set({ name, value: "", ...options });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return { isAuth: false };

    const u = data.user;
    const name =
      (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) ||
      (u.email ? u.email.split("@")[0] : undefined) ||
      undefined;

    return {
      isAuth: true,
      userName: name,
      userId: u.id,
      email: u.email ?? undefined,
    };
  } catch {
    return { isAuth: false };
  }
}
