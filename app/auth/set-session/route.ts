// app/api/auth/set-session/route.ts
// Properly sets Supabase auth cookies using the official server client, so the
// cookie name & format (sb-<project-ref>-auth-token) are correct.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
  try {
    const { access_token, refresh_token } = await req.json();
    if (!access_token || !refresh_token) {
      return NextResponse.json({ ok:false, error:"missing_tokens" }, { status: 400 });
    }

    // Prepare a response we can attach cookies to
    const res = NextResponse.json({ ok: true });

    // Create a one-off server client that writes cookies to *this* response
    const requestCookies = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => requestCookies.get(name)?.value,
          set: (name: string, value: string, options: any) => {
            res.cookies.set(name, value, options);
          },
          remove: (name: string, options: any) => {
            res.cookies.set(name, "", { ...options, maxAge: 0 });
          },
        },
      }
    );

    // This call makes the SDK set the correct cookie (sb-<ref>-auth-token)
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) {
      return NextResponse.json({ ok:false, error: error.message }, { status: 401 });
    }

    return res;
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "unknown" }, { status: 500 });
  }
}
