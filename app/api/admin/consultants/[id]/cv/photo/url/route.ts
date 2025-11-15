import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET = "workers-cv";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();

  const objectPath = `${id}/profile.jpg`;

  // Try to create a signed URL (works for both public/private buckets)
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, 60 * 60 * 24 * 365); // 1 year

  if (error || !data?.signedUrl) {
    return NextResponse.json({ ok: false, error: "Object not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, url: data.signedUrl });
}
