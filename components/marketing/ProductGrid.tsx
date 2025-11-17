"use client";
import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function ProductGrid() {
  const t = useTranslations("marketing.home.products");
  const cards = [
    { key: "fastQuestion", href: "/ask", emoji: "⚡" },
    { key: "opinion", href: "/ask", emoji: "📝" },
    { key: "docReview", href: "/how-it-works/corporate", emoji: "🔎" },
  ] as const;
const btnClass = (key: typeof cards[number]["key"]) =>
  ({
    fastQuestion: "bg-blue-600 hover:bg-blue-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-300",
    opinion:     "bg-sky-500 hover:bg-sky-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-200",
    docReview:   "bg-orange-500 hover:bg-orange-600 text-white focus:outline-none focus:ring-2 focus:ring-orange-200",
  }[key] ?? "bg-blue-600 hover:bg-blue-700 text-white");
  return (
	<section className="hidden md:block py-8 md:py-12 bg-slate-50 border-t border-b border-slate-200">
	   {/* hidden md:block silersen mobilde görünür */}
      <div className="mx-auto max-w-[clamp(320px,90vw,1280px)] px-4 md:px-8">
        <h2 className="text-lg font-semibold mb-6">{t("title")}</h2>
        <div className="grid md:grid-cols-3 gap-4 md:gap-6">
          {cards.map((c) => (
            <div key={c.key} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="text-3xl">{c.emoji}</div>
              <div className="mt-3 font-semibold">{t(`cards.${c.key}.title`)}</div>
              <div className="mt-1 text-sm text-slate-600">{t(`cards.${c.key}.desc`)}</div>
              <Link href={c.href} className={`mt-4 inline-flex rounded-full px-4 py-2 text-sm ${btnClass(c.key)}`}>
                {t(`cards.${c.key}.cta`)}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
