// /lib/brand.ts
export type Tenant = "TR" | "EN";
const DEFAULT_TENANT: Tenant =
  (process.env.DEFAULT_TENANT_CODE?.toUpperCase() === "EN" ? "EN" : "TR");
export function tenantFromHost(host?: string): Tenant {
  const h = (host || "").toLowerCase();

  // PROD alan adları
  if (h.includes("gumruk360.com")) return "TR";
  if (h.includes("tr.easycustoms360.com")) return "EN";

  // DEV senaryosu: host'a göre ayrıştır
  // localhost => TR  |  127.0.0.1 => EN
  if (/^localhost(:\d+)?$/.test(h)) return "TR";
  if (/^127\.0\.0\.1(:\d+)?$/.test(h)) return "EN";

  // varsayılan güvenli seçim
  return DEFAULT_TENANT;
}

export type CompanyInfo = {
  companyName: string;
  address?: string;
  email?: string;
  taxOffice?: string;
  taxNumber?: string;
};

const COMPANY_INFO: Record<Tenant, CompanyInfo> = {
  TR: {
    companyName: "Gümrük360 A.Ş.",
    address: "Adres (TR)",
    email: "info@gumruk360.com",
    taxOffice: "Vergi Dairesi",
    taxNumber: "1234567890",
  },
  EN: {
    companyName: "EasyCustoms360 Ltd.",
    address: "Address (EN)",
    email: "hello@easycustoms360.com",
    taxOffice: "Tax Office",
    taxNumber: "GB123456789",
  },
};

 export type SocialLinks = {
  linkedin: string;
  twitter: string;
  instagram: string;
 };
 
 const SOCIAL_LINKS: Record<Tenant, SocialLinks> = {
   TR: {
     linkedin: "https://www.linkedin.com/company/gumruk-360", // TODO: gerçek Gümrük360 hesabını yaz
    twitter: "https://x.com/gumruk360",   // TODO: gerçek Gümrük360 hesabını yaz
     instagram: "https://www.instagram.com/gumruk360/", // TODO: gerçek Gümrük360 hesabını yaz
   },
   EN: {
     linkedin: "https://www.linkedin.com/company/easycustoms360", // TODO: gerçek EasyCustoms360 hesabını yaz
    twitter: "https://x.com/EasyCustoms360",   // TODO: gerçek EasyCustoms360 hesabını yaz
     instagram: "https://www.instagram.com/easycustoms360/", // TODO: gerçek EasyCustoms360 hesabını yaz
   },
 };

 export function getSocialLinks(t: Tenant): SocialLinks {
   return SOCIAL_LINKS[t];
 }

export function getCompanyInfo(t: Tenant): CompanyInfo {
  return COMPANY_INFO[t] ?? COMPANY_INFO.TR;
}
export function brandName(t: Tenant) {
  return t === "EN" ? "EasyCustoms360" : "Gümrük360";
}

export function brandTagline(t: Tenant) {
  return t === "EN" ? "Customs & Trade Solutions" : "Gümrük ve Dış Ticaret Çözümleri";
}
