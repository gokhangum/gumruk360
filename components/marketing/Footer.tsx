"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { tenantFromHost } from "@/lib/brand";
 export default function Footer() {
  const t = useTranslations("marketing.home.footer_i18n");
  const tb = useTranslations("marketing");
  // Footer logo (black) – tenant'a göre
 const [footerLogo, setFooterLogo] = useState<string | null>(null);
   useEffect(() => {
   if (typeof window === "undefined") return;
   const host = window.location.hostname;
     const tenant = tenantFromHost(host);
   const logo =
      tenant === "EN"
       ? "/brand/easycustoms360bl-opt.svg"
        : "/brand/gumruk360bl-opt.svg";
    setFooterLogo(logo);
 }, []);
  return (

    <footer className="border-t border-slate-200 mt-16">
      <div className="max-w-[clamp(320px,90vw,1280px)] mx-auto px-4 md:px-8 py-10 grid grid-cols-2 md:grid-cols-5 gap-8 text-sm">
        <div>
          <div className="mb-3">
  {footerLogo ? (
    <img src={footerLogo} alt={tb("brandName")} className="h-10 w-auto block" />
  ) : (
    <span className="font-semibold">{tb("brandName")}</span>
  )}
</div>
          <p className="text-slate-600">{t("aboutDesc")}</p>
        </div>
        <div>
          <div className="font-semibold mb-3">{t("colProducts")}</div>
          <ul className="space-y-2 text-slate-700">
            <li><Link href="/ask">{t("links.fastQuestion")}</Link></li>
            <li><Link href="/dashboard/credits">{t("links.indcredit")}</Link></li>
            <li><Link href="/dashboard/subscription">{t("links.orgcredit")}</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3">{t("colResources")}</div>
          <ul className="space-y-2 text-slate-700">
            <li><Link href="/how-it-works/individual">{t("links.hiwind")}</Link></li>
            <li><Link href="/how-it-works/corporate">{t("links.hiwcorp")}</Link></li>
         
			<li><Link href="/blog">{t("links.blog")}</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3">{t("colContact")}</div>
          <ul className="space-y-2 text-slate-700">
            <li><Link href="/contact">{t("links.contact")}</Link></li>
            <li><Link href="/legal/privacy">{t("links.privacy")}</Link></li>
            <li><Link href="/legal/terms">{t("links.terms")}</Link></li>
          </ul>
        </div>
                {/* En sağda sabit Consphera logosu (tüm sitelerde aynı) */}
          <div className="col-span-2 md:col-span-1 flex items-start md:justify-end justify-start mt-8 md:mt-14 overflow-visible pr-2">
		
            <a href="https://www.consphera.com" target="_blank" rel="noopener noreferrer" aria-label="Consphera">
             <img src="/brand/Conspherapsa-opt.svg" alt="Consphera" className="h-10 object-contain block shrink-0" />
			 	
            </a>
          </div>
      </div>

      <div className="text-xs text-slate-500 border-t border-slate-200 py-4 text-center">
        {t("copyright", { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}
