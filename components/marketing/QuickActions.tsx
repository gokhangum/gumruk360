"use client";
import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function QuickActions() {
  const t = useTranslations("marketing.home.quickActions");
  const items = [
    { href: "/ask", key: "tariff", icon: "📚" },
    { href: "/ask", key: "origin", icon: "🌍" },
    { href: "/ask", key: "taxes", icon: "💸" },
    { href: "/ask", key: "exemptions", icon: "🛡️" },
    { href: "/ask", key: "technical", icon: "🧪" },
    { href: "/ask", key: "docs", icon: "📄" },
    { href: "/ask", key: "otvkkdf", icon: "🧾" },
    { href: "/ask", key: "drawback", icon: "↩️" },
  ] as const;

  return (
    <section className="py-8 md:py-12 bg-slate-50 border-t border-b border-slate-200">
      <div className="mx-auto max-w-[clamp(320px,90vw,1280px)] px-4 md:px-8">
        <h2 className="text-lg font-semibold mb-4">{t("title")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
          {items.map((a) => (
            <Link
              key={a.key}
              href={a.href}
              className="group rounded-xl border border-slate-200 bg-white hover:border-slate-300 p-4 flex items-center gap-3 shadow-sm"
            >
              <span className="text-xl">{a.icon}</span>
              <span className="text-sm font-medium text-slate-800 group-hover:underline">
                {t(`items.${a.key}`)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
