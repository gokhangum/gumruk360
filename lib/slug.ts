// lib/slug.ts
export function slugifyTr(input: string, maxLen = 96): string {
  if (!input) return "";

  // 1) TR özel harfleri ASCII eşdeğerine çevir
  const trMap: Record<string, string> = {
    ç: "c", Ç: "c",
    ğ: "g", Ğ: "g",
    ı: "i", I: "i", İ: "i",
    ö: "o", Ö: "o",
    ş: "s", Ş: "s",
    ü: "u", Ü: "u",
  };
  const replaced = input.replace(/[çÇğĞıİöÖşŞüÜI]/g, ch => trMap[ch] ?? ch);

  // 2) Küçült (TR yereli), diakritikleri düşür
  let s = replaced
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // 3) & -> " ve ", harf/rakam dışını tire yap
  s = s
    .replace(/&/g, " ve ")
    .replace(/[^a-z0-9]+/g, "-")     // yalnızca a-z0-9 ve tire kalsın
    .replace(/-{2,}/g, "-")          // birden fazla tireyi tekle
    .replace(/^-+|-+$/g, "");        // baş/son tireleri sil

  // 4) Uzunluğu sınırla
  if (maxLen > 0 && s.length > maxLen) {
    s = s.slice(0, maxLen).replace(/-+$/g, ""); // sondaki kesik tiri sil
  }

  // 5) Boş kaldıysa güvenli yedek
  return s || "post";
}
