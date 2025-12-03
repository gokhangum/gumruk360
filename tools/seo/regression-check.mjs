// tools/seo/regression-check.js
// Minimal SEO smoke test for TR & EN bases.
// Usage:
//   node tools/seo/regression-check.js
//   TR_BASE=https://gumruk360.com EN_BASE=https://tr.easycustoms360.com node tools/seo/regression-check.js

import fs from "node:fs/promises";

// Bases (override via env)
const BASES = [
  process.env.TR_BASE || "https://gumruk360.com",
  process.env.EN_BASE || "https://tr.easycustoms360.com",
];

// Paths to test
const PATHS = ["/", "/about", "/contact"];

// Simple head tag tests (regex on HTML)
const HEAD_TESTS = [
  { name: "canonical", re: /<link\s+rel=["']canonical["']/i },
  { name: "hreflang tr-TR", re: /hreflang=["']tr-TR["']/i },
  { name: "hreflang en", re: /hreflang=["']en["']/i },
];

// Follow one redirect hop and ensure 200
async function headOk(url) {
  const r = await fetch(url, { redirect: "manual" });
  if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
    const finalUrl = new URL(r.headers.get("location"), url).toString();
    const r2 = await fetch(finalUrl);
    return r2.ok;
  }
  return r.ok;
}

async function checkPage(url) {
  const r = await fetch(url);
  const html = await r.text();
  const results = {};
  for (const t of HEAD_TESTS) results[t.name] = t.re.test(html);
  return { status: r.status, results };
}

async function main() {
  const out = [];

  for (const base of BASES) {
    // Pages
    for (const p of PATHS) {
      const url = `${base}${p}`;
      const ok = await headOk(url);
      const head = ok ? await checkPage(url) : { status: "redirect/fail", results: {} };
      out.push({ url, ok, ...head });
    }
    // robots.txt
    const robotsUrl = `${base}/robots.txt`;
    const robots = await fetch(robotsUrl);
    out.push({ url: robotsUrl, ok: robots.ok, status: robots.status });

    // sitemap.xml
    const smUrl = `${base}/sitemap.xml`;
    const sm = await fetch(smUrl);
    out.push({ url: smUrl, ok: sm.ok, status: sm.status });
  }

  await fs.mkdir("logs", { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `logs/seo_regression_${ts}.tsv`;
  const body = out
    .map((x) => `${x.url}\t${x.ok}\t${x.status}\t${JSON.stringify(x.results || {})}`)
    .join("\n");
  await fs.writeFile(path, body, "utf8");

  console.log(`\n=== SEO regression summary ===\n${body}\n\n→ Saved: ${path}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
