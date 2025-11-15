// app/api/admin/openai-status/route.ts
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

export async function GET() {
  const enabled = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== '')
  return NextResponse.json({ ok: true, enabled })
}
