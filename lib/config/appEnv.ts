// lib/config/appEnv.ts
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
function opt(name: string, def?: string): string | undefined {
  const v = process.env[name];
  return v ?? def;
}
function list(name: string, def: string[] = []) {
  const v = process.env[name];
  return v ? v.split(",").map(s => s.trim()).filter(Boolean) : def;
}

export const APP_DOMAINS = {
  primary: req("APP_PRIMARY_DOMAIN"),
  en: opt("APP_EN_DOMAIN"),
  mail: req("APP_MAIL_DOMAIN"),
};

export const BRAND = {
  nameTR: opt("APP_BRAND_NAME_TR", "Gümrük360"),
  nameEN: opt("APP_BRAND_NAME_EN", "EasyCustoms360"),
};

export const MAIL = {
  fromName: opt("MAIL_FROM_NAME", "Gumruk360"),
  fromEmail: req("MAIL_FROM_EMAIL"),
  adminNotify: list("ADMIN_NOTIFY_EMAILS"),
};

export const OWNER = {
  email: opt("APP_OWNER_EMAIL"),
};

export type PublicHostPref = {
  publicHost: string;
  mailDomain: string;
  brandName: string;
};

export function resolvePublicHost(): PublicHostPref {
  return {
    publicHost: APP_DOMAINS.primary,
    mailDomain: APP_DOMAINS.mail,
    brandName: BRAND.nameTR ?? "Gümrük360",
  };
}

export function absoluteUrl(path: string): string {
  const base = resolvePublicHost().publicHost;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `https://${base}${p}`;
}
