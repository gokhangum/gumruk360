
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

function makeCode() {
  const d = new Date()
  const ymd = d.toISOString().slice(0,10).replace(/-/g,'')
  const rnd = Math.random().toString(36).slice(2,6).toUpperCase()
  return `PR-${ymd}-${rnd}`
}

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

export async function POST(req: Request) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 })

  const body = await req.json().catch(()=>null) as { question_ids: string[] }
  const ids = Array.isArray(body?.question_ids) ? body!.question_ids : []
  if (ids.length === 0) return NextResponse.json({ ok:false, error:'no_items' }, { status: 400 })

  // Fetch profile + agreement rate
  const { data: profile } = await supabase.from('profiles').select('tenant_key, full_name').eq('id', user.id).single()
  const tenant_key = profile?.tenant_key || 'tr'
  const worker_name = profile?.full_name || '—'

  const { data: wa } = await supabase.from('worker_agreements').select('rate').eq('worker_id', user.id).single()
  if (!wa?.rate && wa?.rate !== 0) return NextResponse.json({ ok:false, error:'agreement_rate_missing' }, { status: 400 })
  const rate = Number(wa.rate)

  // Load questions
  const { data: rows, error } = await supabase
    .from('questions')
    .select('id, created_at, price_final_tl, price_final_usd, price_usd_rate_used, price_usd_asof')
    .in('id', ids)
    .eq('assigned_to', user.id)
    .eq('answer_status', 'sent')

  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 400 })
  if (!rows || rows.length === 0) return NextResponse.json({ ok:false, error:'no_rows' }, { status: 400 })

  // Compute items
  const items = rows.map(r => {
    const currency = (r.price_final_usd && Number(r.price_final_usd) > 0) ? 'USD' : 'TRY'
    const payment_amount = currency === 'USD' ? Number(r.price_final_usd) : Number(r.price_final_tl)
    const kur = currency === 'TRY' ? 1 : Number(r.price_usd_rate_used || 0)
    const fx = Number(r.price_usd_rate_used || 0)
    let final_amount = 0
    if (tenant_key === 'tr') {
      final_amount = payment_amount * kur
    } else {
      if (currency === 'USD') final_amount = payment_amount
      else final_amount = fx ? (payment_amount / fx) : 0
    }
    const agreement_rate = rate
    const hakedis = final_amount * agreement_rate
    return {
      question_id: r.id,
      question_date: r.created_at?.slice(0,10),
      amount_tl: currency === 'TRY' ? payment_amount : null,
      amount_usd: currency === 'USD' ? payment_amount : null,
      price_usd_rate_used: kur === 1 ? null : kur,
      fx_usd_try_on_date: fx || null,
      final_amount,
      agreement_rate,
      hakedis
    }
  })

  const total_hakedis = items.reduce((acc, x) => acc + x.hakedis, 0)
  const currency = tenant_key === 'tr' ? 'TRY' : 'USD'
  const code = makeCode()

  // Insert header
  const { data: pr, error: e1 } = await supabase
    .from('payment_requests')
    .insert({
      code,
      worker_id: user.id,
      status: 'pending',
      created_by: user.id,
      tenant_key,
      total_settlement: total_hakedis,
      currency
    })
    .select('id, code')
    .single()

  if (e1 || !pr) return NextResponse.json({ ok:false, error: e1?.message || 'insert_failed' }, { status: 400 })

  // Insert items
  const { error: e2 } = await supabase
    .from('payment_request_items')
    .insert(items.map(it => ({ ...it, payment_request_id: pr.id })))

  if (e2) return NextResponse.json({ ok:false, error: e2.message }, { status: 400 })

  // Notify admin (best-effort)
  try {
    const emails = (process.env.PAYMENT_ADMIN_EMAILS || process.env.ADMIN_EMAILS || '').split(',').map(s=>s.trim()).filter(Boolean)
    if (emails.length) {
      // Use Resend if configured
      const from = process.env.MAIL_FROM || 'Gumruk360 <noreply@mail.gumruk360.com>'
      const site = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      const url = `${site}/admin/danisman-odeme-yonetimi/${encodeURIComponent(code)}`
      const subject = `[Gumruk360] Yeni ödeme talebi: ${code}`
      const text = `Worker: ${worker_name}\nKod: ${code}\nKalem sayısı: ${items.length}\nToplam hakediş: ${total_hakedis.toFixed(2)} ${currency}\nDetay: ${url}`
      // Lazy import to avoid bundling error if key missing
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY || '')
      await resend.emails.send({ from, to: emails, subject, text })
    }
  } catch {}

  return NextResponse.json({ ok:true, code })
}
