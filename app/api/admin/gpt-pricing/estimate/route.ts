export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/serverAdmin";
import OpenAI from "openai";

async function makeSupabase() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createServerClient(url, key, {
    cookies: {
      get: async (name) => (await cookies()).get(name)?.value,
      set: async (name, value, options?: CookieOptions) => { const c = await cookies(); c.set(name, value, options as any); },
      remove: async (name, options?: CookieOptions) => { const c = await cookies(); c.set(name, "", { ...options, maxAge: 0 }); }
    },
  });
}


type Band = { range: string; factor: number };
function progressiveFactor(bands: Band[], sBase: number) {
  const x = Math.round(sBase);
  for (const b of bands) {
    const [a, z] = b.range.split("-").map(Number);
    if (x >= a && x <= z) return b.factor;
  }
  return bands.at(-1)?.factor ?? 1.0;
}

type GptOut = {
  perCriterion?: Record<string, number>; // key -> 0..10
  legalScore?: number;                   // 0..10
  languageScore?: number;                // 0..10
  languageGap?: { ratioHint?: number };  // 0..1 (bilgi amaçlı)
  inferred?: {
    gtip_present?: boolean;
    gtip_difficulty?: number;           // 0..10
    n_gtip?: number;                    // >=1
  }
};

function buildRubric(criteria: any[]) {
  // 11 kritik için kısa ankorlar
  const rules: Record<string, string> = {
    k_gtip:
      "0: HS yok. 2: HS mevcut, net/kolay. 5: bazı belirsizlikler. 8: birden çok aday/yorum. 10: çok karmaşık/çoklu HS.",
    k_valuation:
      "0: standart kıymet. 2: basit indirim/navlun dağıtımı. 5: birkaç aykırılık. 8: royalty/lisans + birden çok aykırılık. 10: yoğun uyuşmazlık riski.",
    k_legal:
      "0: tek madde, net. 2: sınırlı ek düzenleme. 5: birden fazla tebliğ. 8: istisna/çelişki/içtihat ihtiyacı. 10: kapsamlı hukuki analiz.",
    k_layers:
      "0: tek işlem. 2: +1 katman. 5: 2-3 katman. 8: 3+ katman. 10: çoklu rejim/transfer/antrepo zinciri.",
    k_tax:
      "0: vergi yok/tek basit vergi. 2: tek vergi ama basit değil. 5: birden fazla vergi. 8: çoklu vergi+karmaşık matrah. 10: kapsamlı hesap.",
    k_docs:
      "0: az belge/az sayfa. 2: sınırlı hacim. 5: orta hacim. 8: yüksek hacim/çoklu dil. 10: çok yüksek hacim/Latin dışı.",
    k_foreign:
      "0: tamamen TR/EN sade. 2: az yabancı içerik. 5: belirgin yabancı/teknik dil. 8: çoklu dil/teknik. 10: Latin dışı + teknik + çoklu dil.",
    k_permits:
      "0: izin yok. 2: tek basit izin. 5: CE veya TAREKS. 8: CE+TAREKS/çoklu kurum. 10: birden fazla kurum+koşul.",
    k_origin:
      "0: menşe/FTA etkisiz. 2: basit menşe ispatı. 5: FTA kural kıyası gerekli. 8: karma menşe/ülke kuralı. 10: çoklu FTA/karma yapı.",
    k_cleanup:
      "0: veri temiz. 2: küçük toparlama. 5: belirgin temizlik. 8: ciddi ön-analiz. 10: çok dağınık + yoğun analiz.",
    k_intlref:
      "0: uluslararası referans gerekmez. 2: nadiren. 5: AB/ülke kıyası gerekiyor. 8: birden fazla ülke. 10: yoğun karşılaştırma."
  };

  const lines = (criteria || []).map((c: any) => {
    const t = rules[c.key] || "";
    return `- ${c.key}: ${t}`;
  });

  return lines.join("\n");
}

function isUniformScores(per: Record<string, number> | undefined) {
  if (!per) return true;
  const vals = Object.values(per);
  if (vals.length === 0) return true;
  const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
  const variance = vals.reduce((s, x) => s + (x - mean) ** 2, 0) / vals.length;
  const stdev = Math.sqrt(variance);
  return stdev < 0.75; // aşırı tekdüze
}

function heuristicScores(text: string, keys: string[]): Record<string, number> {
  const q = (text || "").toLowerCase();
  const hit = (re: RegExp) => re.test(q);

  const m = {
    gtip: hit(/gtip|hs ?code|tarife|classification|harmonized|hsn/),
    diff: hit(/birden|çoklu|alternatif|ambig|belirsiz/),
    royalty: hit(/royalty|lisans|license|license fee/),
    discount: hit(/iskonto|indirim|discount/),
    freight: hit(/navlun|freight|sigorta|insurance/),
    legal: hit(/tebliğ|kanun|yönetmelik|içtihat|mevzuat|regulation|case ?law/),
    layers: hit(/transit|antrepo|d[ii]ib|ipr|warehouse/),
    taxes: hit(/kdv|ö[ t]v|em[üu]|vat|sct|excise|duty|tax/),
    docs: hit(/sayfa|page|pdf|ek|appendix|annex|doc/),
    foreign: hit(/çeviri|translate|english|arabic|russian|chinese|japanese|spanish|german|latin d[ıi]ş[ıi]|non[- ]latin|cyrillic|汉字/),
    permits: hit(/ce|tareks|izin|permit|certificate/),
    origin: hit(/menşe|fta|sta|origin|preferential/),
    messy: hit(/dağınık|eksik|cleanup|temizle/),
    intl: hit(/eu|ab |union|us |uk |china|japan|korea|wto|iso/)
  };

  const out: Record<string, number> = {};
  for (const k of keys) {
    let s = 2; // taban
    if (k === "k_gtip") s = m.gtip ? (m.diff ? 8 : 5) : 0;
    else if (k === "k_valuation") s = (m.royalty || m.discount || m.freight) ? (m.royalty ? 8 : 5) : 2;
    else if (k === "k_legal") s = m.legal ? 7 : 2;
    else if (k === "k_layers") s = m.layers ? (m.layers && m.diff ? 7 : 5) : 1;
    else if (k === "k_tax") s = m.taxes ? (m.taxes && m.diff ? 8 : 5) : 2;
    else if (k === "k_docs") s = m.docs ? (m.foreign ? 7 : 5) : (m.foreign ? 4 : 2);
    else if (k === "k_foreign") s = m.foreign ? (m.foreign && m.diff ? 8 : 6) : 1;
    else if (k === "k_permits") s = m.permits ? (m.permits && m.diff ? 8 : 5) : 1;
    else if (k === "k_origin") s = m.origin ? (m.diff ? 8 : 5) : 2;
    else if (k === "k_cleanup") s = m.messy ? 6 : 2;
    else if (k === "k_intlref") s = m.intl ? (m.diff ? 8 : 5) : 1;

    out[k] = Math.max(0, Math.min(10, s));
  }
  return out;
}

async function callGptOnce(question: string, criteriaRows: any[], ext: any, attachmentsMeta: any[], retryNote?: string): Promise<GptOut> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const openai = new OpenAI({ apiKey });

  const critList = (criteriaRows || []).filter((r: any) => r.enabled).map((r: any) => r.key);
  const rubric = buildRubric(criteriaRows);

  const sys = `Sen bir gümrük danışmanlığı ön-fiyatlandırma değerlendiricisisin.
Sadece sayısal puan üret. Puanlar 0..10 aralığında ve ayrımcı olmalı; "5" sadece belirsiz durumlarda.
Aşağıdaki JSON şemasına sadık kal.`;

  const user = `
${retryNote ? `UYARI: ${retryNote}\n` : ""}
Soru:
"""${question}"""

Ekler (yalnızca meta):
${JSON.stringify(attachmentsMeta || [], null, 2)}

Kriter anahtarları:
${critList.join(", ")}

Puanlama ankorları:
${rubric}

Kurallar:
- "perCriterion" içindeki anahtarlar kriter key'leriyle birebir aynı olmalı.
- GTİP için "perCriterion.k_gtip" yalnızca zorluk (0..10) olmalı. HS mevcutsa ayrıca "inferred.gtip_present=true" ve "inferred.gtip_difficulty" ver.
- "inferred.n_gtip" (>=1) tahmini yapmaya çalış.
- "legalScore" ve "languageScore" (0..10) döndür.
- "languageGap.ratioHint" 0..1 öneri (opsiyonel).

YANITI YALNIZCA GEÇERLİ JSON OLARAK DÖN.

Şema:
{
  "perCriterion": { "k_gtip": 0-10, "k_valuation": 0-10, "k_legal": 0-10, "k_layers": 0-10, "k_tax": 0-10, "k_docs": 0-10, "k_foreign": 0-10, "k_permits": 0-10, "k_origin": 0-10, "k_cleanup": 0-10, "k_intlref": 0-10 },
  "legalScore": 0-10,
  "languageScore": 0-10,
  "languageGap": { "ratioHint": 0-1 },
  "inferred": { "gtip_present": true/false, "gtip_difficulty": 0-10, "n_gtip": 1-99 }
}
`;

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0,
    top_p: 0,
    seed: 42,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user }
    ]
  });

  const text = completion.choices?.[0]?.message?.content?.trim() || "{}";
  try {
    return JSON.parse(text) as GptOut;
  } catch {
    return {} as GptOut;
  }
}

async function callGpt(question: string, criteriaRows: any[], ext: any, attachmentsMeta: any[]) {
  // 1. deneme
  let out = await callGptOnce(question, criteriaRows, ext, attachmentsMeta);
  if (isUniformScores(out.perCriterion)) {
    // 2. deneme: uniform uyarısı
    out = await callGptOnce(
      question,
      criteriaRows,
      ext,
      attachmentsMeta,
      "Önceki puanlar çok tekdüze göründü. Lütfen uç değerleri de kullan, bariz olmayan durumlarda bile 4–6 dışına çıkmaktan çekinme."
    );
  }
  return out;
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin;
  const { question, isUrgent, attachmentsMeta = [] } = await req.json();

  const { data: v, error: ve } = await supabase
    .from("v_pricing_active_version")
    .select("*")
    .single();
  if (ve) return NextResponse.json({ error: ve.message }, { status: 500 });

  const { data: crit, error: ce } = await supabase
    .from("v_pricing_active_criteria")
    .select("*")
    .order("order_index", { ascending: true });
  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });

  const { data: extRow } = await supabase.from("pricing_ext_config").select("config").eq("version_id", v.id).maybeSingle();
  const ext = {
    pointsPerHour: 10,
    term: { hoursPerDay: 4, urgentFactor: 0.5 },
    progressive_bands: [
      { range: "0-10", factor: 1.0 }, { range: "11-20", factor: 1.2 }, { range: "21-30", factor: 1.4 },
      { range: "31-40", factor: 1.6 }, { range: "41-50", factor: 1.8 }, { range: "51-60", factor: 2.0 },
      { range: "61-70", factor: 2.2 }, { range: "71-80", factor: 2.4 }, { range: "81-90", factor: 2.6 }, { range: "91-100", factor: 2.8 }
    ] as Band[],
    optionals: {
      gtip: { enabled: true, explanation: "", perAltGtip: 1.0, maxBonus: 10, baseIfPresent: 10, maxBase: 20 },
      legal: { enabled: true, explanation: "", weightMax: 15 },
      language: { enabled: true, explanation: "", weightMax: 10 },
      language_gap: { enabled: true, explanation: "", weightMax: 5 }
    },
    optionals_extra: [],
    ...(extRow?.config as any)
  };

  // —— GPT-4o’dan puanlar
  let gpt: GptOut = {};
  try {
    gpt = await callGpt(String(question || ""), crit || [], ext, attachmentsMeta);
  } catch {
    gpt = {};
  }

  const clamp = (x:number, lo:number, hi:number) => Math.max(lo, Math.min(hi, x));
  const clamp01 = (x:number) => clamp(x, 0, 10) / 10;

  // per-criterion skorlar
  const keys = (crit || []).filter((r: any) => r.enabled).map((r:any) => r.key);
  let perCriterionScore: Record<string, number> = {};
  if (!gpt.perCriterion || isUniformScores(gpt.perCriterion)) {
    perCriterionScore = heuristicScores(String(question || ""), keys);
  } else {
    for (const k of keys) {
      const s = gpt.perCriterion?.[k];
      perCriterionScore[k] = clamp(Number(s ?? 5), 0, 10);
    }
  }

  // GTİP S_base içi özel kural (zorluk puanını baz alıp taban ekliyoruz)
  const gtipBaseIf = ext.optionals.gtip.baseIfPresent ?? 10;
  const gtipBaseMax = ext.optionals.gtip.maxBase ?? 20;
  if (perCriterionScore["k_gtip"] !== undefined) {
    const present = gpt.inferred?.gtip_present === true || /hs ?code|gtip|tarife/i.test(String(question || ""));
    const diff = clamp(Number(gpt.inferred?.gtip_difficulty ?? perCriterionScore["k_gtip"]), 0, 10);
    const forcedIfPresent = present ? Math.max(perCriterionScore["k_gtip"], 10 + diff) : perCriterionScore["k_gtip"];
    perCriterionScore["k_gtip"] = Math.min(gtipBaseMax, forcedIfPresent);
  }

  // S_base
  const totalWeight = (crit || []).reduce((s: number, r: any) => s + (r.enabled ? Number(r.weight) : 0), 0);
  let S_base = 0;
  const perCriterion: Array<{ title: string; weight_pct: number; score0_10: number; contribution: number }> = [];

  for (const r of (crit || [])) {
    if (!r.enabled) continue;
    const wPct = totalWeight > 0 ? Number(r.weight) / totalWeight : 0; // 0..1
    const s = clamp(perCriterionScore[r.key] ?? 0, 0, 10);             // 0..10
    const contrib = wPct * s * 10;
    S_base += contrib;
    perCriterion.push({
      title: r.title_tr,
      weight_pct: wPct * 100,
      score0_10: s,
      contribution: Math.round(contrib * 100) / 100
    });
  }

  // Progressive f -> S_eff  (S_eff = S_base × f)
  const f = progressiveFactor(ext.progressive_bands, S_base);
  const S_eff = S_base * f;

  // Opsiyoneller (non-lang)
  const legalScore = Number(gpt.legalScore ?? heuristicScores(String(question || ""), ["k_legal"])["k_legal"] ?? 5);
  const langScore  = Number(gpt.languageScore ?? heuristicScores(String(question || ""), ["k_foreign"])["k_foreign"] ?? 5);

  const legalAdd = ext.optionals.legal.enabled ? clamp01(legalScore) * (ext.optionals.legal.weightMax ?? 15) : 0;
  const languageAdd = ext.optionals.language.enabled ? clamp01(langScore) * (ext.optionals.language.weightMax ?? 10) : 0;

  // GTİP bonus
  const n_gtip = clamp(Number(gpt.inferred?.n_gtip ?? 1), 1, 99);
  const perAltGtip = ext.optionals.gtip.perAltGtip ?? 1.0;
  const maxBonus = ext.optionals.gtip.maxBonus ?? 10.0;
  const gtipAddRaw = ext.optionals.gtip.enabled ? Math.max(0, n_gtip - 1) * perAltGtip : 0;
  const gtipAdd = Math.min(gtipAddRaw, maxBonus);

  // Ek opsiyoneller
  let extrasAdd = 0;
  const extrasDetail: any[] = [];
  for (const o of (ext.optionals_extra ?? [])) {
    if (!o?.enabled) continue;
    const score = 5; // ileride GPT’ye genişletilebilir
    const add = clamp01(score) * Number(o.weightMax ?? 0);
    extrasAdd += add;
    extrasDetail.push({ title_tr: o.title_tr, title_en: o.title_en, score0_10: score, add: Math.round(add * 100) / 100, weightMax: o.weightMax });
  }

  const S_opt_nonlang = legalAdd + languageAdd + gtipAdd + extrasAdd;

  // Dil farkı (ratio) — denom = 100 + legal.weightMax (aktifse) + gtipBonus + language.weightMax (aktifse) + extras.weightMax toplamı
  const extrasWeightMaxSum = (ext.optionals_extra ?? []).reduce((s:number, o:any) => s + (o?.enabled ? Number(o.weightMax ?? 0) : 0), 0);
  const denom =
    100 +
    (ext.optionals.legal.enabled ? (ext.optionals.legal.weightMax ?? 0) : 0) +
    (ext.optionals.gtip.enabled ? gtipAdd : 0) +
    (ext.optionals.language.enabled ? (ext.optionals.language.weightMax ?? 0) : 0) +
    extrasWeightMaxSum;

  const ratio = Math.max(0, Math.min(1, (S_base + S_opt_nonlang) / (denom || 1)));
  const S_lang = ext.optionals.language_gap.enabled
    ? ratio * (ext.optionals.language_gap.weightMax ?? 0)
    : 0;

  // Final puan, saat, termin
  const pointsPerHour = Number(ext.pointsPerHour ?? 10);
  const S_final = S_eff + S_opt_nonlang + S_lang;
  const hours = S_final / pointsPerHour;

  const hoursPerDay = Number(ext.term?.hoursPerDay ?? 4);
  const urgentFactor = Number(ext.term?.urgentFactor ?? 0.5);
  const normalDays = hoursPerDay > 0 ? hours / hoursPerDay : hours / 4;
  const urgentDays = normalDays * urgentFactor;

  // Fiyat
  const hourly = Number(v.base_hourly_rate);
  const minPrice = Number(v.min_price);
  const rounding = Number(v.rounding_step);
  const urgentMul = Number(v.urgent_multiplier);

  const priceNormalRaw = Math.max(minPrice, hours * hourly);
  const priceUrgentRaw = Math.max(minPrice, hours * hourly * urgentMul);

  const roundUpTo = (x: number, step: number) =>
    !step || step <= 0 ? Math.ceil(x) : Math.ceil(x / step) * step;

  const price_normal = roundUpTo(priceNormalRaw, rounding);
  const price_urgent = roundUpTo(priceUrgentRaw, rounding);
  const price_final = isUrgent ? price_urgent : price_normal;

  return NextResponse.json({
    ok: true,
    details: {
      S_base: Math.round(S_base * 100) / 100,
      f,
      S_eff: Math.round(S_eff * 100) / 100,
      S_opt_nonlang: Math.round(S_opt_nonlang * 100) / 100,
      S_lang: Math.round(S_lang * 100) / 100,
      S_final: Math.round(S_final * 100) / 100,
      hours: Math.round(hours * 100) / 100,
	  version_id: v.id,
      price_normal,
      price_urgent,
      min_price: minPrice,
      hourly,
      rounding_step: rounding,
      urgent_multiplier: urgentMul,
      normal_days: Math.round(normalDays * 100) / 100,
      urgent_days: Math.round(urgentDays * 100) / 100,
      perCriterion,
	  perCriterion_map: perCriterionScore,
      optionals: {
        legal: { enabled: !!ext.optionals.legal.enabled, score0_10: legalScore, add: Math.round(legalAdd * 100) / 100, weightMax: ext.optionals.legal.weightMax },
        language: { enabled: !!ext.optionals.language.enabled, score0_10: langScore, add: Math.round(languageAdd * 100) / 100, weightMax: ext.optionals.language.weightMax },
        language_gap: { enabled: !!ext.optionals.language_gap.enabled, add: Math.round(S_lang * 100) / 100, weightMax: ext.optionals.language_gap.weightMax },
        gtip_bonus: { enabled: !!ext.optionals.gtip.enabled, N_gtip_inferred: clamp(Number(gpt.inferred?.n_gtip ?? 1), 1, 99), perAltGtip, add: Math.round(gtipAdd * 100) / 100, maxBonus },
        extras: extrasDetail
      },
      attachments_meta: attachmentsMeta
    },
    price_final
  });
}
