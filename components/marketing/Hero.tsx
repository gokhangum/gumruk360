"use client";
import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

type Card = {
  title: string;
  desc: string;
  href: string;
  emoji: string;
};

export default function Hero() {
 const bgRef = useRef<HTMLSpanElement>(null);
 useEffect(() => {
   // mobilde efekt ve arka plan kapalı
  const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;
   if (!isDesktop()) return;

  const el = bgRef.current;
   if (!el) return;

   const onScroll = () => {
     // yumuşak parallax (0.15 katsayı)
    const y = Math.min(window.scrollY * 0.15, 120);
     el.style.setProperty("--parallax", `${y}px`);
  };
   onScroll();
   window.addEventListener("scroll", onScroll, { passive: true });
  return () => window.removeEventListener("scroll", onScroll);
 }, []);

  const t = useTranslations("marketing.home.hero_i18n");
  const bullets = t.raw("bullets") as string[];

const cards = t.raw("cards") as Card[];

 return (
   <section className="relative overflow-hidden isolate md:min-h-[560px]">
    {/* Desktop: silik arka plan + hafif parallax */}
     <span
      ref={bgRef}
       className="pointer-events-none absolute inset-0 z-0 hidden md:block"
       style={{
        backgroundImage: "url('/hero/businessmanfull2.png')",
        backgroundSize: "cover",
         backgroundPosition: "center",
        // 'silik' etki
         filter: "blur(0px) saturate(0.9) brightness(1)",
         opacity: 0.8,
         // parallax
       transform: "translateY(var(--parallax, 0px))",
        willChange: "transform",
      }}
    />
    {/* Üstten çok hafif karartma, okunabilirliği artırır (desktop) */}
     <span className="absolute inset-0 z-0 hidden md:block bg-gradient-to-b from-slate-900/10 via-transparent to-white/0" />

   <div className="relative z-10 mx-auto max-w-[clamp(320px,90vw,1280px)] px-4 md:px-8">

        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center py-12 md:py-20">
          {/* Left text */}
          <div>
            <h1 className="text-2xl md:text-4xl font-semibold leading-tight">
              {t("title_part1")} <span className="text-slate-500">{t("title_part2")}</span>
            </h1>
            <p className="mt-4 text-slate-700 text-base md:text-lg">
              {t("description")}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/ask" className="rounded-full bg-blue-600 hover:bg-blue-700 text-white px-2 py-3 md:px-5 md:py-3 focus:outline-none focus:ring-2 focus:ring-blue-300">
                {t("cta_primary")}
              </Link>
              <Link href="/how-it-works/individual" className="rounded-full bg-sky-500 hover:bg-sky-600 text-white px-2 py-3 md:px-5 md:py-3 focus:outline-none focus:ring-2 focus:ring-sky-200">
                {t("cta_secondary")}
              </Link>
			     <Link href="/how-it-works/corporate" className="rounded-full bg-green-600 hover:bg-green-700 text-white px-2 py-3 md:px-5 md:py-3 focus:outline-none focus:ring-2 focus:ring-green-200">
                {t("cta_secondary2")}
              </Link>
            </div>
            {bullets.length > 0 && (
              <ul className="mt-6 text-sm text-slate-600 space-y-1">
                {bullets.map((b, i) => (<li key={i}>• {b}</li>))}
              </ul>
            )}
          </div>

          {/* Right side: 2x2 card grid */}
          <div className="relative">
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
             {cards.map((c, idx) => (
            <Link
               key={idx}
                 href={c.href}
                className="block"
             aria-label={t("learn_more_aria", { title: c.title })}
             >
                <div
             className="group rounded-2xl border border-slate-200 ring-1 ring-black/0 hover:ring-black/5
          bg-gradient-to-br from-slate-50 to-white
         flex items-center justify-center relative overflow-hidden
           transform-gpu will-change-transform
           shadow-[0_10px_0_0_rgba(226,232,240,1),0_24px_36px_rgba(2,6,23,0.12)]
              hover:-translate-y-1
            hover:shadow-[0_8px_0_0_rgba(226,232,240,1),0_20px_30px_rgba(2,6,23,0.16)]
            active:translate-y-0
          active:shadow-[0_6px_0_0_rgba(226,232,240,1),0_12px_18px_rgba(2,6,23,0.20)]
             transition-transform duration-200 min-h-[220px] md:min-h-[260px] lg:min-h-0 lg:aspect-[4/3]"
                >
                    <div className="flex flex-col justify-center h-full text-center px-3 sm:px-4 md:px-1 break-words pointer-events-none">
                    <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl">{c.emoji}</div>
                    <div className="mt-2 md:mt-3 font-medium text-sm sm:text-base break-words">
                     {c.title}
                    </div>
                  <div className="text-slate-600 text-xs md:text-sm mt-1 break-words">
                    {c.desc}
                 </div>
                  </div>
   <span
                   className="pointer-events-none hidden md:inline-flex absolute bottom-3 left-1/2 -translate-x-1/2 items-center justify-center rounded-full bg-red-600 text-white text-[14px] px-3 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                 >
                   {t("learn_more")}
                 </span>
                  </div>
                </Link>
             ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}