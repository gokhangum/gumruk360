// components/utils/url.ts
// Basit yardımcılar: mesaj gövdesinden aksiyon URL'lerini çıkarır
// ve konu satırına göre TR/EN buton label'ları döner.

const URL_REGEX = /https?:\/\/[^\s]+/g;

export type ActionUrls = {
  askUrl?: string;
  subsUrl?: string;
};

/**
 * Mesaj gövdesindeki URL'leri tarayıp:
 * - "/ask/" geçen ilk URL'yi askUrl olarak,
 * - "subscription", "credits", "kredi" geçen ilk URL'yi subsUrl olarak,
 * bulmaya çalışır.
 * Hiçbiri bulunamazsa ilk/ikinci URL'leri fallback olarak kullanır.
 */
export function extractActionUrls(body: string): ActionUrls {
  const urls = (body.match(URL_REGEX) || []).map((u) => u.trim());

  let askUrl = urls.find((u) => u.includes("/ask/"));
  let subsUrl = urls.find(
    (u) =>
      u.toLowerCase().includes("subscription") ||
      u.toLowerCase().includes("credits") ||
      u.toLowerCase().includes("kredi")
  );

  // Fallback: hiçbiri bulunamazsa, sırayla ilk ve ikinci URL'leri kullan
  if (!askUrl && urls.length > 0) {
    askUrl = urls[0];
  }
  if (!subsUrl && urls.length > 1) {
    subsUrl = urls.find((u) => u !== askUrl) || urls[1];
  }

  return { askUrl, subsUrl };
}

export type ButtonLabels = {
  ask: string;
  subs: string;
};

/**
 * Konu satırından (subject) dil tahmini yapıp TR / EN buton label'ları döndürür.
 * - TR ipuçları: "Kurumsal", "Kredi", "Yetersiz" vb.
 * - Aksi halde EN label'lar kullanılır.
 */
export function labelsFor(subject: string): ButtonLabels {
  const s = subject.toLowerCase();

  const isTR =
    s.includes("kurumsal") ||
    s.includes("kredi") ||
    s.includes("yetersiz") ||
    s.includes("gümrük360") ||
    s.includes("gumruk360");

  if (isTR) {
    return {
      ask: "Soruyu aç",
      subs: "Kredi satın al",
    };
  }

  return {
    ask: "Open question",
    subs: "Buy credits",
  };
}
