// app/api/admin/questions/[id]/assign/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../../lib/supabase/serverAdmin'
import { assertAdmin } from '../../../../../../lib/auth/requireAdmin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
 const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
   await assertAdmin(req)

  const p = await ctx.params
  const id = p?.id
  const body = await req.json().catch(() => ({}))
  const worker_email = String(body?.worker_email || '').trim().toLowerCase()
  if (!worker_email) {
    return NextResponse.json({ ok: false, error: 'worker_email is required' }, { status: 400 })
  }

  // Supabase v2: auth.admin.getUserByEmail YOK.
  // Çözüm: listUsers ile çekip e-posta eşleştir.
  const adminApi: any = (supabaseAdmin as any).auth?.admin
  if (!adminApi?.listUsers) {
    return NextResponse.json({ ok: false, error: 'Admin API not available' }, { status: 500 })
  }

  // Önce e-posta parametreli dene (bazı sürümlerde desteklenir), olmazsa tüm sayfayı çekip filtrele.
  let targetUser: any | null = null

  // (A) Olası e-posta filtresi (bazı SDK sürümlerinde geçerli)
  try {
    const res = await adminApi.listUsers({ page: 1, perPage: 200, email: worker_email } as any)
    const users = (res?.data?.users ?? res?.users ?? []) as any[]
    targetUser = users.find(u => String(u?.email || '').toLowerCase() === worker_email) || null
  } catch {
    // no-op -> (B)'ye düş
  }

  // (B) Genel listeyi çek ve e-postaya göre filtrele
  if (!targetUser) {
    const res = await adminApi.listUsers({ page: 1, perPage: 200 } as any)
    const users = (res?.data?.users ?? res?.users ?? []) as any[]
    targetUser = users.find(u => String(u?.email || '').toLowerCase() === worker_email) || null
  }

  if (!targetUser) {
    return NextResponse.json({ ok: false, error: 'User not found for given email' }, { status: 404 })
  }

  const worker_id = targetUser.id

  const { data, error } = await supabaseAdmin
    .from('questions')
    .update({ assigned_to: worker_id })
    .eq('id', id)
    .select('id, assigned_to')
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, data })
}
