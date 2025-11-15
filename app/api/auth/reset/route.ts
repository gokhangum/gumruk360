// app/api/auth/password/reset/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";

function getBaseUrl(req: Request) {
  // Prefer x-forwarded-host for prod behind proxy; fallback to Host header
  const url = new URL(req.url);
  const xfHost = req.headers.get("x-forwarded-host");
  const host = xfHost || url.host;
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ ok:false, error:"missing_email" }, { status: 400 });
    }
    const base = getBaseUrl(req);
    const redirectTo = `${base}/reset-password?email=${encodeURIComponent(email)}`;

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      return NextResponse.json({ ok:false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok:true });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "unknown" }, { status: 500 });
  }
}
