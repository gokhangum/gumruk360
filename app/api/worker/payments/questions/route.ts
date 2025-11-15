
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

async function getSupabase(){
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
        get(name){ return cookieStore.get(name)?.value },
        set(name, value, options){ cookieStore.set({ name, value, ...options }) },
        remove(name, options){ cookieStore.set({ name, value: '', ...options }) },
      } }
  )
}

export async function GET() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 })

  // Fetch worker profile (tenant_key) and agreement rate
  const { data: profile } = await supabase.from('profiles').select('tenant_key').eq('id', user.id).single()
  const tenant_key = profile?.tenant_key || 'tr'

  const { data: wa } = await supabase.from('worker_agreements').select('rate').eq('worker_id', user.id).single()
  const agreement_rate = wa?.rate ?? null

  // Sent questions assigned to this worker
  const { data: rows, error } = await supabase
    .from('questions')
    .select('id, created_at, price_final_tl, price_final_usd, price_usd_rate_used, price_usd_asof')
    .eq('assigned_to', user.id)
    .eq('answer_status', 'sent')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 400 })

  // Map computed fields
  const items = (rows||[]).map(r => {
    const currency = (r.price_final_usd && Number(r.price_final_usd) > 0) ? 'USD' : 'TRY'
    const payment_amount = currency === 'USD' ? Number(r.price_final_usd) : Number(r.price_final_tl)
    const kur = currency === 'TRY' ? 1 : Number(r.price_usd_rate_used || 0)
    const fx = Number(r.price_usd_rate_used || 0) // Fallback: use same field; replace with TCMB on-date if available
    let final_amount = 0
    if (tenant_key === 'tr') {
      final_amount = payment_amount * kur
    } else {
      if (currency === 'USD') final_amount = payment_amount
      else final_amount = fx ? (payment_amount / fx) : 0
    }
    const hakedis = agreement_rate != null ? final_amount * Number(agreement_rate) : null

    return {
      id: r.id,
      created_at: r.created_at,
      currency,
      payment_amount,
      kur,
      fx,
      final_amount,
      agreement_rate,
      hakedis,
    }
  })

  return NextResponse.json({ ok:true, tenant_key, agreement_rate, items })
}
