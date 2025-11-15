// app/api/admin/health/route.ts
import { NextResponse } from 'next/server'
import { assertAdmin } from '../../../../lib/auth/requireAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
   try {
 await assertAdmin(req)
   return NextResponse.json({ ok: true, scope: 'admin', email })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Forbidden' }, { status: e?.statusCode || 403 })
  }
}
