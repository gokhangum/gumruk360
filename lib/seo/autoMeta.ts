// lib/seo/autoMeta.ts
// Deterministic, lightweight auto meta generator (TR/EN stopwords + n-grams).
// Cleans HTML if given, produces summary / SEO description / keywords / tags.

export type AutoMetaInput = {
  title?: string | null;
  contentHtml?: string | null;   // If you have rich HTML, pass here
  contentText?: string | null;   // If you already have plain text, pass here
  preferredLang?: "tr" | "en";   // Default: "tr"
  knownTags?: string[];          // Your tag pool (e.g., ["gümrük","ithalat",...])
};

export type AutoMetaOutput = {
  seoTitle: string;              // <= 60 chars
  seoDescription: string;        // ~140–160 chars
  summary: string;               // ~200–260 chars (UI summary box)
  keywords: string[];            // 5–10 items, ranked
  tags: string[];                // 3–6 items, kebab-case
};

const TR_STOP = new Set<string>([
  "ve","veya","ile","da","de","ki","mi","bu","şu","o","bir","iki","üç","çok","az","daha","en",
  "ama","fakat","ancak","çünkü","için","gibi","ise","yani","hem","hele","mı","mi","mu","mü",
  "olarak","olan","olanlar","var","yok","dahi","bile","her","hiç","şey","şeyi","şeyler","kadar",
  "sonra","önce","artık","yine","aynı","tüm","tümünü","sadece","özellikle","genellikle","eğer",
  "üzerine","hakkında","göre","eden","etmek","yapmak","olmak","edilir","yapılır","olur",
]);

const EN_STOP = new Set<string>([
  "the","a","an","and","or","but","if","so","because","as","of","in","on","for","with","by","to",
  "is","are","was","were","be","been","being","it","its","this","that","these","those","at","from",
  "then","than","also","only","very","just","any","some","such","much","many","can","could","should",
  "would","will","about","over","under","after","before","again","same","all","most","more","less",
]);

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeSliceByChars(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut.slice(0, max)).trim();
}

function firstSentences(text: string, minChars: number, maxChars: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const parts = clean.split(/(?<=[.!?])\s+/);
  let acc = "";
  for (const p of parts) {
    const next = acc ? `${acc} ${p}` : p;
    if (next.length >= minChars) {
      return safeSliceByChars(next, maxChars);
    }
    acc = next;
  }
  return safeSliceByChars(clean, maxChars);
}

function tokenize(text: string): string[] {
  // Remove combining marks WITHOUT inserting spaces; prevents "g u m r u k"
  const noMarks = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // e.g., "gümrük" -> "gumruk"
    .toLowerCase();

  return noMarks
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function buildNGrams(tokens: string[], n: 2 | 3) {
  const grams: string[] = [];
  for (let i = 0; i < tokens.length - (n - 1); i++) {
    grams.push(tokens.slice(i, i + n).join(" "));
  }
  return grams;
}

function scoreKeywords(
  tokens: string[],
  stop: Set<string>,
  maxSingle = 12,
  maxBi = 8,
  maxTri = 4
) {
  const singles = new Map<string, number>();
  for (const t of tokens) {
    if (stop.has(t)) continue;
    if (t.length <= 2) continue;
    singles.set(t, (singles.get(t) ?? 0) + 1);
  }
  const bigrams = buildNGrams(tokens, 2).filter(g => !g.split(" ").some(w => stop.has(w)));
  const trigrams = buildNGrams(tokens, 3).filter(g => !g.split(" ").some(w => stop.has(w)));

  const bi = new Map<string, number>();
  for (const g of bigrams) bi.set(g, (bi.get(g) ?? 0) + 2); // bigram weighting
  const tri = new Map<string, number>();
  for (const g of trigrams) tri.set(g, (tri.get(g) ?? 0) + 3); // trigram weighting

  const scored: Array<[string, number]> = [];
  for (const [k, v] of singles) scored.push([k, v]);
  for (const [k, v] of bi) scored.push([k, v]);
  for (const [k, v] of tri) scored.push([k, v]);

  scored.sort((a, b) => b[1] - a[1]);

  const pick: string[] = [];
  const used = new Set<string>();
  for (const [k] of scored) {
    const base = k.split(" ")[0];
    if (used.has(k) || used.has(base)) continue;
    pick.push(k);
    used.add(k);
    used.add(base);
    if (pick.length >= maxSingle + maxBi + maxTri) break;
  }
  return pick;
}

function toKebabClean(s: string) {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")      // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function autoMeta({
  title,
  contentHtml,
  contentText,
  preferredLang = "tr",
  knownTags = [],
}: AutoMetaInput): AutoMetaOutput {
  const stop = preferredLang === "en" ? EN_STOP : TR_STOP;
  const rawText = (contentText && contentText.trim())
    ? contentText
    : (contentHtml ? htmlToText(contentHtml) : "");

  // Summary ~200–260
  const summary = firstSentences(rawText, 180, 260) || safeSliceByChars(rawText, 240);
  // SEO Description ~140–160
  const seoDescription = firstSentences(rawText, 120, 160) || safeSliceByChars(summary, 160);
  // SEO Title <=60
  const baseTitle = (title || rawText.split(/[.!?\n]/)[0] || "Blog Yazısı").trim();
  const seoTitle = safeSliceByChars(baseTitle, 60);

  // Keywords (rank + cleanup)
  const tokens = tokenize(rawText);
  const ranked = scoreKeywords(tokens, stop);
  // Take top 10 and clean artifacts like "g t i p"
  const cleanedKeywords = ranked.slice(0, 10)
    .map(k => k.replace(/\s+/g, " ").trim())
    .map(k => {
      const parts = k.split(" ");
      const allSingle = parts.every(w => w.length === 1);
      if (allSingle && parts.length >= 3) {
        return parts.join(""); // "g t i p" -> "gtip"
      }
      return k;
    })
    .filter(k => k.length >= 3);

  // Deduplicate (case-insensitive)
  const seenKW = new Set<string>();
  const keywordsFinal: string[] = [];
  for (const k of cleanedKeywords) {
    const key = k.toLowerCase();
    if (!seenKW.has(key)) {
      seenKW.add(key);
      keywordsFinal.push(k);
    }
  }

  // Tags: prefer knownTags matches, then kebab of keywords
  const lowerKnown = knownTags.map(t => t.toLowerCase());
  const tagSet = new Set<string>();

  for (const k of keywordsFinal) {
    const hit = lowerKnown.find(t => k.toLowerCase().includes(t));
    if (hit) tagSet.add(toKebabClean(hit));
    if (tagSet.size >= 6) break;
  }
  for (const k of keywordsFinal) {
    if (tagSet.size >= 6) break;
    const keb = toKebabClean(k);
    if (keb && keb.length >= 3) tagSet.add(keb);
  }

  const tags = Array.from(tagSet).slice(0, Math.max(3, Math.min(6, tagSet.size)));

  return { seoTitle, seoDescription, summary, keywords: keywordsFinal, tags };
}
