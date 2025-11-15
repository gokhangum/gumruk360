import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
 const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
 const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
 if (!supabaseUrl) {
   throw new Error("Supabase URL missing. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
 }
const supa = createClient(supabaseUrl, supabaseServiceKey);

// GET: aktif kriterler (view)
export async function GET() {
  const { data, error } = await supa.from('v_pricing_active_criteria').select('*').order('order_index', { ascending:true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

// POST: yeni kriter ekle (yalnızca meta)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { key, title_tr, title_en, description_tr, description_en, is_optional, order_index } = body;
  const { data, error } = await supa.from('pricing_criteria').insert({
    key, title_tr, title_en, description_tr, description_en,
    is_optional: !!is_optional, enabled: true, order_index: order_index ?? 0
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
