import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

 export async function POST(_req: NextRequest) {
  return NextResponse.json({ ok: true })
 }

