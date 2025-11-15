export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/serverAdmin';

/**
 * POST /api/auth/password/send
 * Body: { email }
 * Uses Supabase resetPasswordForEmail to send mail.
 * Normalizes duplicate/rate-limit errors to success.
 */
function base(req: Request) {
  const url = new URL(req.url);
  const xfHost = req.headers.get('x-forwarded-host') || url.host;
  const proto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':','');
  return `${proto}://${xfHost}`;
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ ok:false, error:'missing_email' }, { status:400 });

    const redirectTo = `${base(req)}/reset-password`;
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      const status = (error as any).status || 0;
      if (status === 409 || status === 429 || msg.includes('already') || msg.includes('too many')) {
        // Normalize duplicate/rate-limit → treat as success
        return NextResponse.json({ ok:true, note:`normalized_${status||'err'}` });
      }
      return NextResponse.json({ ok:false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok:true });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
