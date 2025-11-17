// (marketing)/about page – add a left accent SVG that repeats vertically and ends with content
import { getTranslations } from "next-intl/server";

export const revalidate = 3600;

export async function generateMetadata() {
  const t = await getTranslations("about");
  return { title: t("hero.title") };
}

export default async function Page() {
  const t = await getTranslations("about");
  const raw: any = (t as any).raw ? (t as any).raw.bind(t) : (k: string) => t(k);

  return (
    <div className="bg-gradient-to-b from-white to-slate-0 py-1">
     <div className="w-full px-0 py-4 md:max-w-[clamp(320px,80vw,928px)] md:mx-auto md:px-6 lg:px-8 md:py-6">
        <div className="card-surface shadow-colored p-5 md:p-6 space-y-4">
		            {/* Accent wrapper: keeps the graphic only as tall as the content */}
            <div className="relative pl-0 md:pl-28 lg:pl-28">
              {/* Left accent column (96px), repeats vertically and ends with content */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-24 hidden md:block"
                style={{
                  backgroundImage: "url('/edge-accent-network-orange-fade-v3-fixed.svg')",
                  backgroundRepeat: "repeat-y",
                  backgroundPosition: "left top",
                  backgroundSize: "96px auto",
                  opacity: 1,
                }}
              />
          <header>
            <h1 className="text-xl md:text-2xl font-semibold mt-8 md:mt-4 mb-8 md:mb-6">{t("hero.title")}</h1>
          </header>
          <main>
            
              <article
                className="prose prose-sm prose-slate max-w-none prose-headings:scroll-mt-24 prose-a:underline-offset-2"
                dangerouslySetInnerHTML={{ __html: raw("body_html") }}
              />
       
          </main>
        </div>
      </div>
    </div></div>
  );
}
