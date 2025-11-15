// lib/analytics.ts
// Additive: tiny helpers for environment checks and config sourcing.
export function isLikelyStagingHost(host?: string) {
  const h = (host || '').toLowerCase();
  if (!h) return true; // default safe: treat as staging in uncertain envs
  return h.includes('localhost') || h.includes('127.0.0.1') || h.endsWith('.local') || h.includes('staging');
}

export function getAnalyticsConfigFromEnv() {
  // Minimal: allow env-based quick start. You can replace this with a DB-backed resolver.
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID || null;
  const ga4Id = process.env.NEXT_PUBLIC_GA4_ID || null;
  return { gtmId, ga4Id };
}
