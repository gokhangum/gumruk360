// app/api/admin/questions/[id]/generate-draft/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

export async function POST() {
  // Bu endpoint EMEKLI edildi. Yeni akış: /api/admin/gpt-answers/run
  return NextResponse.json(
    { ok: false, error: 'deprecated: use /api/admin/gpt-answers/run' },
    { status: 410 }
  )
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'deprecated: use /api/admin/gpt-answers/run' },
    { status: 410 }
  )
}
