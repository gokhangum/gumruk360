// app/api/me/role/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin"; // projede zaten var

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set() {}, remove() {}
        }
      }
    );

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id as string | undefined;

    if (!userId) {
      return NextResponse.json({ role: "guest" }, { status: 200 });
    }

    // RLS'e takılmamak için service-role (server) ile oku
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    const role = (prof as any)?.role || "user";
    return NextResponse.json({ role }, { status: 200 });
  } catch (e) {
    // Hata olsa da client'ı düşürmeyelim
    return NextResponse.json({ role: "user" }, { status: 200 });
  }
}
