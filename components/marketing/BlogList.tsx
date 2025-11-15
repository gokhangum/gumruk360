"use client";
import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export type Item = { id: string; title: string; date: string; href: string };

export default function BlogList({ items }: { items: Item[] }) {
  const t = useTranslations("marketing.home.blog");
  return (
    <section className="py-10 md:py-14 bg-slate-50 border-t border-b border-slate-200">
      <div className="mx-auto max-w-[clamp(320px,90vw,1280px)] px-4 md:px-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <Link href="/blog" className="text-sm text-slate-700 hover:underline">{t("seeAll")}</Link>
        </div>
        <div className="grid md:grid-cols-3 gap-4 md:gap-6">
          {items.map(x => (
            <Link key={x.id} href={x.href} className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-sm">
              <div className="text-xs text-slate-500">{x.date}</div>
              <div className="mt-2 font-medium">{x.title}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
