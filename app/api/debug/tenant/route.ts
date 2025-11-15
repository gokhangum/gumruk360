import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getTenantByHost } from "@/lib/tenant";
export async function GET() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || undefined;
  const t = await getTenantByHost(host);
  return NextResponse.json({ ok: true, host, tenant: t });
}
