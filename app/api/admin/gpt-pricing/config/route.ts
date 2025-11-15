import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

async function makeSupabase() {
    
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createServerClient(url, key, {
    cookies: {
      get: async (name) => (await cookies()).get(name)?.value,
      set: async (name, value, options?: CookieOptions) => { const c = await cookies(); c.set(name, value, options as any) },
      remove: async (name, options?: CookieOptions) => { const c = await cookies(); c.set(name, "", { ...options, maxAge: 0 }) }
    }
  });
}

type Criterion = {
  id?: string; // UI'dan gelebilir ama sunucuda kullanılmaz
  key?: string; // KAYIT KİMLİĞİ (ANA)
  title_tr: string;
  title_en: string;
  description_tr: string | null;
  description_en: string | null;
  is_optional: boolean;
  order_index: number;
  weight: number;
  enabled: boolean;
  norm_weight?: number;
};

type OptionalExtra = {
  id?: string;
  enabled: boolean;
  title_tr: string;
  title_en: string;
  explanation: string;
  weightMax: number;
};

type ExtConfig = {
  pointsPerHour: number;
  term: { hoursPerDay: number; urgentFactor: number };
  progressive_bands: { range: string; factor: number }[];
  optionals: {
    gtip: { enabled: boolean; explanation: string; perAltGtip: number; maxBonus: number; baseIfPresent: number; maxBase: number };
    legal: { enabled: boolean; explanation: string; weightMax: number };
    language: { enabled: boolean; explanation: string; weightMax: number };
    language_gap: { enabled: boolean; explanation: string; weightMax: number };
  };
  optionals_extra?: OptionalExtra[];
};

function defaultExtConfig(): ExtConfig {
  return {
    pointsPerHour: 10,
    term: { hoursPerDay: 4, urgentFactor: 0.5 },
    progressive_bands: [
      { range: "0-10", factor: 1.0 },
      { range: "11-20", factor: 1.2 },
      { range: "21-30", factor: 1.4 },
      { range: "31-40", factor: 1.6 },
      { range: "41-50", factor: 1.8 },
      { range: "51-60", factor: 2.0 },
      { range: "61-70", factor: 2.2 },
      { range: "71-80", factor: 2.4 },
      { range: "81-90", factor: 2.6 },
      { range: "91-100", factor: 2.8 }
    ],
    optionals: {
      gtip: { enabled: true, explanation: "N_gtip fazlasına bonus; S_base içi GTİP kuralı ayrıca geçerli.", perAltGtip: 1.0, maxBonus: 10.0, baseIfPresent: 10, maxBase: 20 },
      legal: { enabled: true, explanation: "Hukuki süreç ihtimali/karmaşıklığı.", weightMax: 15 },
      language: { enabled: true, explanation: "Yabancı dil/dilsel zorluk.", weightMax: 10 },
      language_gap: { enabled: true, explanation: "Taraflar arası dil farkı; ratio formülüne göre.", weightMax: 5 }
    },
    optionals_extra: []
  };
}

// 11 kriterin sabit başlangıç listesi (sadece ilk kurulum fallback)
function canonicalCriteria(): Criterion[] {
  const rows: Array<[string,string,string,number,string,string]> = [
    ['k_gtip', 'GTİP değerlendirmesi', 'HS code assessment', 20,
      'GTİP varsa katkı = 10 + zorluk (0–10); yoksa 0.',
      'If HS code exists: base = 10 + difficulty (0–10); else 0.'],
    ['k_valuation', 'Kıymet mevzuatı karışıklığı', 'Customs valuation complexity', 11,
      'Royalty/lisans, indirim/iskonto, navlun & sigorta dağıtımı, fire vb.',
      'Royalty/licence, discounts, freight/insurance allocation, wastage, etc.'],
    ['k_legal', 'Hukuki/Mevzuat karmaşıklığı', 'Legal/regulatory complexity', 15,
      'Tek madde → düşük; çoklu tebliğ/istisna/çelişki/içtihat → yüksek.',
      'Single article → low; multi-notice/exceptions/conflicts/case-law → high.'],
    ['k_layers', 'Rejim/İşlem katman sayısı', 'Regime/operation layers', 6,
      'Transit/antrepo/DİİB vb. katmanlar arttıkça puan artar.',
      'More layers (transit/warehouse/inward processing) → higher.'],
    ['k_tax', 'Hesaplama ihtiyacı (KDV/ÖTV/EMÜ)', 'Tax calculation needs (VAT/SCT/etc.)', 10,
      'Tek vergi & sade matrah → düşük; çoklu vergi + karmaşık matrah → yüksek.',
      'Single tax & simple base → low; multiple taxes & complex base → high.'],
    ['k_docs', 'Doküman adedi & sayfa hacmi', 'Doc count & page volume', 15,
      'Hacim temelli; yabancı dil oranı/çoklu dil/Latin dışı varsa artış uygula.',
      'Volume-based; increase if foreign/multi-language/non-Latin.'],
    ['k_foreign', 'Yabancı dil/çeviri gerekliliği', 'Foreign language/translation need', 6,
      'r_foreign, teknik seviye, dil sayısı, Latin dışı ile hesaplanır.',
      'Based on foreign ratio, technicality, language count, non-Latin.'],
    ['k_permits', 'Dış kurum/izin süreçleri', 'External agencies/permits', 7,
      'CE+TAREKS/çoklu izin → yüksek.', 'Multiple permits (e.g., CE+TAREKS) → higher.'],
    ['k_origin', 'Menşe/FTA/ülke kuralı', 'Origin/FTA/country rules', 7,
      'İlave vergi/FTA kural kıyası/karma menşe → yüksek.',
      'Additional duties/FTA rule comparison/mixed origin → higher.'],
    ['k_cleanup', 'Veri temizliği & ek analiz', 'Data cleanup & extra analysis', 3,
      'Dağınık veri/ön analiz ihtiyacı → yüksek.',
      'Messy data/pre-analysis needed → higher.'],
    ['k_intlref', 'Uluslararası mevzuat referansı', 'International regulatory reference', 7,
      'AB/diğer ülke kıyası arttıkça yüksek.',
      'Higher if EU/other country cross-reference needed.'],
  ];

  return rows.map((r, i) => ({
    key: r[0],
    title_tr: r[1],
    title_en: r[2],
    weight: r[3],
    description_tr: r[4],
    description_en: r[5],
    is_optional: false,
    order_index: i + 1,
    enabled: true,
    norm_weight: r[3]
  }));
}

export async function GET() {
  const supabase = await makeSupabase();

  const { data: v, error: ve } = await supabase.from("v_pricing_active_version").select("*").single();
  if (ve) return NextResponse.json({ error: ve.message }, { status: 500 });

  const { data: crit, error: ce } = await supabase
    .from("v_pricing_active_criteria")
    .select("*")
    .order("order_index", { ascending: true });
  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });

  const { data: extRow } = await supabase.from("pricing_ext_config").select("config").eq("version_id", v.id).maybeSingle();
  const extConfig: ExtConfig = {
    ...defaultExtConfig(),
    ...(extRow?.config as ExtConfig | undefined)
  };

  const criteria: Criterion[] =
    (crit && crit.length > 0)
      ? (crit as any[]).map((r) => ({
          // View'den gelen id'yi artık referans olarak kullanmıyoruz
          key: r.key,
          title_tr: r.title_tr,
          title_en: r.title_en,
          description_tr: r.description_tr,
          description_en: r.description_en,
          is_optional: r.is_optional,
          order_index: r.order_index,
          weight: Number(r.weight),
          enabled: r.enabled,
          norm_weight: Number(r.norm_weight)
        }))
      : canonicalCriteria(); // ilk kurulum

  return NextResponse.json({ version: v, criteria, extConfig });
}

// Benzersiz key üret
function genKey() {
  return `k_custom_${Math.random().toString(36).slice(2, 10)}`;
}

// Verilen kriter için (key varsa) pricing_criteria satırını bulur/oluşturur ve id döner
async function ensureCriterionByKey(supabase: Awaited<ReturnType<typeof makeSupabase>>, c: Criterion): Promise<{ id: string; key: string }> {
  let key = (c.key || "").trim();

  if (key) {
    // Var mi?
    const { data: exist } = await supabase.from("pricing_criteria").select("id").eq("key", key).maybeSingle();

    if (exist?.id) {
      // Meta güncelle (başlık/açıklama/sıra)
      await supabase.from("pricing_criteria").update({
        title_tr: c.title_tr,
        title_en: c.title_en,
        description_tr: c.description_tr,
        description_en: c.description_en,
        is_optional: !!c.is_optional,
        order_index: c.order_index ?? 0,
        enabled: true
      }).eq("id", exist.id);
      return { id: exist.id as string, key };
    }

    // Yoksa aynı key ile eklemeyi dene (teorik olarak unique olabilir)
    const { data: ins, error: insErr } = await supabase
      .from("pricing_criteria")
      .insert({
        key,
        title_tr: c.title_tr,
        title_en: c.title_en,
        description_tr: c.description_tr,
        description_en: c.description_en,
        is_optional: !!c.is_optional,
        enabled: true,
        order_index: c.order_index ?? 0
      })
      .select("id")
      .single();

    if (!insErr && ins?.id) return { id: ins.id as string, key };

    // Çakışma olursa yeni key üret
    key = "";
  }

  // Key yoksa veya çakıştıysa yeni benzersiz key üretip ekle
  for (let attempt = 0; attempt < 6; attempt++) {
    const tryKey = key || genKey();
    const { data: ins2, error: err2 } = await supabase
      .from("pricing_criteria")
      .insert({
        key: tryKey,
        title_tr: c.title_tr,
        title_en: c.title_en,
        description_tr: c.description_tr,
        description_en: c.description_en,
        is_optional: !!c.is_optional,
        enabled: true,
        order_index: c.order_index ?? 0
      })
      .select("id")
      .single();
    if (!err2 && ins2?.id) return { id: ins2.id as string, key: tryKey };
    const msg = String(err2?.message || "");
    if (!(msg.includes("duplicate key value") || msg.includes("unique constraint"))) {
      throw err2; // farklı hata: fırlat
    }
    // duplicate ise bir sonraki denemeye bırak
  }

  throw new Error("Yeni kriter için benzersiz key üretilemedi.");
}

export async function POST(req: NextRequest) {
  const supabase = await makeSupabase();
  const body = await req.json();

  const {
    versionName,
    notes,
    base_hourly_rate,
    min_price,
    urgent_multiplier,
    rounding_step,
    auto_price_threshold,
    criteria,
    extConfig
  } = body as {
    versionName: string;
    notes?: string;
    base_hourly_rate: number;
    min_price: number;
    urgent_multiplier: number;
    rounding_step: number;
    auto_price_threshold?: number | null;
    criteria: Criterion[];
    extConfig: ExtConfig;
  };

  if (!versionName) return NextResponse.json({ error: "versionName gerekli" }, { status: 400 });
  const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "no_session" }, { status: 401 });
const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
if (adminErr) return NextResponse.json({ error: "rpc_is_admin_failed" }, { status: 500 });
if (!isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });


  try {
    // Eski aktifi kapat
    await supabase.from("pricing_versions").update({ is_active: false }).eq("is_active", true);

    // Yeni versiyonu oluştur
    const { data: vIns, error: vErr } = await supabase
      .from("pricing_versions")
      .insert({
        version_name: versionName,
        notes: notes ?? null,
        is_active: true,
        base_hourly_rate,
        min_price,
        urgent_multiplier,
        rounding_step,
        auto_price_threshold: auto_price_threshold ?? null,
        created_by: user.id
      })
      .select("*")
      .single();
    if (vErr) throw vErr;

    const versionId = vIns.id as string;

    // Tüm kriterleri key bazlı garanti edip versiyon öğesi ekle
    for (const c of criteria) {
      // UI'dan gelen id'yi KULLANMIYORUZ — sadece key ile ilerliyoruz
      const safeC: Criterion = {
        ...c,
        title_tr: c.title_tr || "",
        title_en: c.title_en || "",
        description_tr: c.description_tr ?? null,
        description_en: c.description_en ?? null,
        order_index: Number.isFinite(c.order_index as number) ? c.order_index : 0,
        weight: Number(c.weight ?? 0),
        enabled: !!c.enabled
      };

      const { id: critId } = await ensureCriterionByKey(supabase, safeC);

      const { error: viErr } = await supabase.from("pricing_version_items").insert({
        version_id: versionId,
        criteria_id: critId,
        weight: safeC.enabled ? Number(safeC.weight) : 0,
        enabled: safeC.enabled
      });
      if (viErr) throw viErr;
    }

    // ext config
    const cfg: ExtConfig = extConfig ?? defaultExtConfig();
    const { error: cfgErr } = await supabase.from("pricing_ext_config").insert({ version_id: versionId, config: cfg });
    if (cfgErr) throw cfgErr;

    // audit
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: "admin",
      action: "update",
      event: "pricing.version_created",
      resource_type: "pricing_version",
      resource_id: versionId,
      payload: { versionName, notes }
    });

    return NextResponse.json({ ok: true, version_id: versionId });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
