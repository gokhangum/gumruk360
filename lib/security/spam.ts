// lib/security/spam.ts
export type SpamScore = {
  linksPer100w: number;
  repeatCharMax: number;
  repeatWordMax: number;
  total: number; // normalize edilmiş 0–100
};

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

export function scoreTextSpam(input: string): SpamScore {
  const text = normalizeSpaces(String(input || ""));
  const words = text.split(" ").filter(Boolean);
  const wordCount = Math.max(words.length, 1);

  // link sayısı
  const links = (text.match(/\bhttps?:\/\/[^\s]+/gi) || []).length;
  const linksPer100w = (links / wordCount) * 100;

  // tekrar eden karakter ve kelime
  let repeatCharMax = 0;
  (text.match(/(.)\1{2,}/g) || []).forEach((m) => {
    repeatCharMax = Math.max(repeatCharMax, m.length);
  });

  const map = new Map<string, number>();
  words.forEach((w) => map.set(w.toLowerCase(), (map.get(w.toLowerCase()) || 0) + 1));
  let repeatWordMax = 0;
  map.forEach((v) => (repeatWordMax = Math.max(repeatWordMax, v)));

  // basit normalize (isteğe göre ağırlıklandır)
  const total =
    Math.min(100, linksPer100w * 10) + // 0–10+ aralığı 0–100'e ölçek
    Math.min(100, (repeatCharMax - 2) * 8) + // 3+ tekrar karakter şüpheli
    Math.min(100, (repeatWordMax - 5) * 6); // aynı kelime 6+ defa

  return { linksPer100w, repeatCharMax, repeatWordMax, total: Math.max(0, Math.min(100, total)) };
}

export function isTextSuspicious(score: SpamScore, thresholds?: {
  linksPer100w?: number;
  repeatCharMax?: number;
  repeatWordMax?: number;
  total?: number;
}) {
  const t = {
    linksPer100w: Number(process.env.SPAM_LINKS_PER_100W_MAX || 3),
    repeatCharMax: Number(process.env.SPAM_REPEAT_CHAR_MAX || 6),
    repeatWordMax: Number(process.env.SPAM_REPEAT_WORD_MAX || 12),
    total: Number(process.env.SPAM_TOTAL_MAX || 60),
    ...(thresholds || {}),
  };
  return (
    score.linksPer100w > t.linksPer100w ||
    score.repeatCharMax > t.repeatCharMax ||
    score.repeatWordMax > t.repeatWordMax ||
    score.total > t.total
  );
}
