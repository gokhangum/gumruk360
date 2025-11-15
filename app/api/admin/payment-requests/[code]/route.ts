
import { NextRequest, NextResponse } from 'next/server'
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

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ code: string }> }
 ) {
   const { code } = await context.params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { data: header, error: e1 } = await supabase
    .from('payment_requests')
    .select('id, code, worker_id, status, payment_reference, created_at')
    .eq('code', code)
    .single()

  if (e1 || !header) return NextResponse.json({ ok: false, error: e1?.message || 'not_found' }, { status: 404 })

  const { data: workerP } = await supabase
    .from('profiles')
    .select('full_name, tenant_key')
    .eq('id', header.worker_id)
    .single()

  const { data: lines, error: e2 } = await supabase
    .from('payment_request_items')
    .select('id, question_id, question_date, amount_tl, amount_usd, price_usd_rate_used, fx_usd_try_on_date, final_amount, agreement_rate, hakedis')
    .eq('payment_request_id', header.id)
    .order('question_date', { ascending: true })

  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 400 })

  const total_hakedis = (lines || []).reduce((acc: number, r: any) => acc + (Number(r.hakedis) || 0), 0)

  return NextResponse.json({
    ok: true,
    header: {
      ...header,
      worker_name: workerP?.full_name || '—',
      worker_tenant: workerP?.tenant_key || null,
    },
    lines,
    totals: { total_hakedis }
  })
}
