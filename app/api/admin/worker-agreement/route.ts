
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { z } from 'zod'

const BodySchema = z.object({
  worker_id: z.string().uuid(),
  rate: z.number().min(0).max(1),
})

 export async function GET() {
  const supabase = await supabaseServer()
  // Require admin
  const { data: { user } } = await supabase.auth.getUser()
   if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // You may have an is_admin() RPC; here we trust RLS for select on worker_agreements
  const { data: agreements, error } = await supabase
    .from('worker_agreements')
    .select('worker_id, rate, updated_at')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, agreements })
}

 export async function POST(req: Request) {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
 if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })


  const json = await req.json().catch(() => null)
  const parse = BodySchema.safeParse(json)
  if (!parse.success) return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  const { worker_id, rate } = parse.data

  const { data, error } = await supabase
    .from('worker_agreements')
    .upsert({ worker_id, rate, updated_by: user.id }, { onConflict: 'worker_id' })
    .select('worker_id, rate, updated_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, data })
}
