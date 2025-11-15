
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

function getSupabase() {
  return (async () => {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )
    return supabase
  })()
}

import { z } from 'zod'

export async function GET(req: Request) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const worker_id = searchParams.get('worker_id')

  let query = supabase.from('payment_requests')
    .select('code, worker_id, status, payment_reference, created_at, total_settlement, currency')
    .order('created_at', { ascending: false })

  if (worker_id) query = query.eq('worker_id', worker_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, items: data })
}

const PatchSchema = z.object({
  code: z.string(),
  status: z.enum(['pending','approved','needs_fix','rejected']).optional(),
  payment_reference: z.string().max(255).optional(),
})

export async function PATCH(req: Request) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const json = await req.json().catch(() => null)
  const parse = PatchSchema.safeParse(json)
  if (!parse.success) return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  const { code, status, payment_reference } = parse.data

  const patch: Record<string, any> = {}
  if (typeof status !== 'undefined') {
    patch.status = status
    if (status === 'approved') patch.approved_at = new Date().toISOString()
  }
  if (typeof payment_reference !== 'undefined') {
    patch.payment_reference = payment_reference || null
  }

  const { data, error } = await supabase.from('payment_requests')
    .update(patch)
    .eq('code', code)
    .select('code, status, payment_reference, approved_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, data })
}
