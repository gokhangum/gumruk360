// app/api/dev/set-sub/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 404 });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get("type"); // 'individual' | 'corporate' | 'clear'
  const res = NextResponse.json({ ok: true, type: type || 'clear' });

  if (type === 'individual' || type === 'corporate') {
    res.cookies.set('g360_sub', type, { path: '/', httpOnly: false });
  } else {
    res.cookies.set('g360_sub', '', { path: '/', httpOnly: false, maxAge: 0 });
  }
  return res;
}
