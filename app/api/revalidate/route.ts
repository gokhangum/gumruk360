// app/api/revalidate/route.ts
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { path } = await req.json();
    if (!path) return NextResponse.json({ ok: false, error: "path required" }, { status: 400 });
    revalidatePath(path);
    return NextResponse.json({ ok: true, path });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "ERR" }, { status: 500 });
  }
}
