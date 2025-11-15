import { NextRequest, NextResponse } from 'next/server'

 export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

 export async function POST(_req: NextRequest) {
   // TODO: PayTR callback doğrulaması (hash kontrolü vb.) burada uygulanacak.
   return NextResponse.json({ ok: true })
 }
