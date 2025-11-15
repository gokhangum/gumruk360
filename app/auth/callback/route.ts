// app/auth/callback/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") || "/redirect/me";
  // Supabase cookie'leri zaten set edildiyse sadece yönlendir.
  return NextResponse.redirect(new URL(next, url.origin));
}
