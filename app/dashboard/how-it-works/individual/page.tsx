"use client"
import React from "react";
import { useTranslations } from "next-intl";

export default function Page() {
  const t = useTranslations("howItWorksIndividual");
  const raw: any = (t as any).raw ? (t as any).raw.bind(t) : (k: string) => t(k);

  const items = [
    { id: "tab1", label: t("tabs.tab1"), html: raw("tab1_html") },
    { id: "tab2", label: t("tabs.tab2"), html: raw("tab2_html") },
  ] as const;

const [active, setActive] = React.useState<(typeof items)[number]["id"]>(items[0].id);

  return (
       <div className="px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
        <div className="card-surface shadow-colored rounded-none md:rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
          <header>
            <h1 className="text-xl md:text-2xl font-semibold">{t("hero.title")}</h1>
          </header>
<article
  className="prose prose-sm prose-slate max-w-none prose-headings:scroll-mt-24 prose-a:underline-offset-2 mt-8 md:mt-4 mb-8 md:mb-6"
  dangerouslySetInnerHTML={{ __html: (t as any).raw ? (t as any).raw("intro_html") : t("intro_html") }}
/>
          <nav className="-mx-5 -mt-5 px-5 md:px-6 pt-4">
		  
            <div role="tablist" aria-label="How it works tabs" className="flex flex-wrap gap-2">
              {items.map((it) => (
                <button
                  key={it.id}
                  role="tab"
                  onClick={() => setActive(it.id)}
                  aria-selected={active === it.id}
                  aria-controls={it.id}
                  className={[
                    "px-4 py-2 text-sm md:text-base font-medium rounded-full transition-all",
                    "border shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60",
                    active === it.id
                      ? "bg-amber-600 text-white border-amber-600 shadow-colored"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-amber-50 hover:border-amber-300 hover:text-slate-900"
                  ].join(" ")}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </nav>

          <main className="pt-5">
            {items.map((it) => (
              <section key={it.id} id={it.id} hidden={active !== it.id} aria-hidden={active !== it.id}>
                <article
                  className="prose prose-sm prose-slate max-w-none prose-headings:scroll-mt-24 prose-a:underline-offset-2"
                  dangerouslySetInnerHTML={{ __html: it.html }}
                />
              </section>
            ))}
          </main>
        </div>
      </div> </div>
   
  );
}
