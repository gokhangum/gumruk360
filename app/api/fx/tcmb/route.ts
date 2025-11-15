export const runtime = "nodejs";

function parseTcmbNumber(input: string): number {
  const s = input.trim();
  // Örnekler:
  // "48,4575"  -> 48.4575      (TR ondalık)
  // "48.4575"  -> 48.4575      (EN ondalık)
  // "1.234,56" -> 1234.56      (binlik: nokta, ondalık: virgül)
  // "1,234.56" -> 1234.56      (binlik: virgül, ondalık: nokta)
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // "1.234,56" tipi: noktalar binlik, virgül ondalık
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    return Number(cleaned);
  } else if (hasComma) {
    // "48,4575" tipi: virgül ondalık
    return Number(s.replace(",", "."));
  } else {
    // "48.4575" veya "484575" gibi
    return Number(s);
  }
}

export async function GET(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const base = (urlObj.searchParams.get("base") || "USD").toUpperCase();

    // TRY istenir ise 1.0 döndür (TRY/TRY)
    if (base === "TRY") {
      const today = new Date().toISOString().slice(0, 10);
      return new Response(
        JSON.stringify({
          ok: true,
          base: "TRY",
          quote: "TRY",
          rate: 1,
          asof: today,
          source: "static: TRY/TRY",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // TCMB günlük kur XML
    const tcmbUrl = "https://www.tcmb.gov.tr/kurlar/today.xml";
    const res = await fetch(tcmbUrl, { cache: "no-store" });
    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `tcmb_fetch_failed:${res.status}` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
    const xml = await res.text();

    // Tarih (örn. <Tarih_Date Date="2025-10-09"...>)
    const dateMatch = xml.match(/<Tarih_Date[^>]*\sDate="([^"]+)"/i);
    const asof = dateMatch?.[1] ?? null;

    // İstenen base için <Currency CurrencyCode="BASE"> bloğunu bul
    const block = xml.match(
      new RegExp(`<Currency[^>]*CurrencyCode="${base}"[^>]*>[\\s\\S]*?<\\/Currency>`, "i")
    )?.[0];

    if (!block) {
      return new Response(
        JSON.stringify({ ok: false, error: `currency_block_not_found:${base}` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // ForexSelling değeri
    const fsMatch = block.match(/<ForexSelling>([\d.,]+)<\/ForexSelling>/i);
    if (!fsMatch) {
      return new Response(
        JSON.stringify({ ok: false, error: "forex_selling_not_found" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const rate = parseTcmbNumber(fsMatch[1]);
    if (!isFinite(rate) || rate <= 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "invalid_rate" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1 BASE = rate TRY
    return new Response(
      JSON.stringify({
        ok: true,
        base,
        quote: "TRY",
        rate,
        asof,
        source: "TCMB today.xml (ForexSelling)",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message ?? "unknown_error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
