"use client";
 import { useState, useRef, useEffect } from "react";
 import Image from "next/image";
 import Link from "next/link";
 import { useTranslations } from "next-intl";
import CvPreviewById from "@/components/cv/CvPreviewById";
 type Author = {
   name: string | null;
  title: string | null;
   bio: string | null;
  avatar_url: string | null;
 };

 type TiptapNode = {
   type?: string;
  text?: string;
   marks?: { type: string; attrs?: any }[];
   attrs?: Record<string, any>;
   content?: TiptapNode[];
 };

function renderTiptapContent(nodes?: TiptapNode[] | null): any {
   if (!nodes || !Array.isArray(nodes)) return null;
  return nodes.map((node, index) => renderTiptapNode(node, index));
 }
function parseTiptapDoc(bio: string): any | null {
  try {
    let val: any = JSON.parse(bio);

    // Çift encode durumu: "\"{...}\"" gibi ise, içini tekrar parse etmeyi dene
    if (typeof val === "string") {
      try {
        const inner = JSON.parse(val);
        val = inner;
      } catch {
        // inner parse edilemezse, val string kalsın
      }
    }

    if (val && typeof val === "object" && (val as any).type === "doc") {
      return val;
    }

    return null;
  } catch {
    return null;
  }
}

function renderTiptapNode(node: TiptapNode, key: number): any {
   if (!node) return null;
   switch (node.type) {
     case "paragraph":
       return <p key={key}>{renderTiptapContent(node.content)}</p>;
     case "text": {
       let text: any = node.text ?? "";
       const marks = node.marks || [];
      for (const mark of marks) {
         if (mark.type === "bold") {
         text = <strong>{text}</strong>;
        } else if (mark.type === "italic") {
          text = <em>{text}</em>;
        } else if (mark.type === "strike") {
          text = <s>{text}</s>;
         } else if (mark.type === "link") {
         const href = mark.attrs?.href || "#";
         text = (
           <a href={href} target="_blank" rel="noopener noreferrer">
              {text}
            </a>
          );
        }
     }
     return <span key={key}>{text}</span>;
    }
	
    case "bulletList":
      return <ul key={key}>{renderTiptapContent(node.content)}</ul>;
     case "orderedList":
     return <ol key={key}>{renderTiptapContent(node.content)}</ol>;
    case "listItem":
       return <li key={key}>{renderTiptapContent(node.content)}</li>;
    case "blockquote":
       return <blockquote key={key}>{renderTiptapContent(node.content)}</blockquote>;
     case "inlineQuote":
      return <span key={key} className="italic">{renderTiptapContent(node.content)}</span>;
    case "image":
      return (
        <img
          key={key}
           src={node.attrs?.src || ""}
           alt={node.attrs?.alt || ""}
          className="my-2 max-h-48 w-auto"
         style={
             node.attrs?.float
             ? { float: node.attrs.float as any, margin: "0 12px 12px 0" }
             : undefined
         }
       />
      );
    case "hardBreak":
     return <br key={key} />;
    default:
      return node.content ? renderTiptapContent(node.content) : null;
   }
 }

function renderAuthorBioContent(bio: string | null): any {
  if (!bio) return null;

  const doc = parseTiptapDoc(bio);
  if (doc) {
    const children = renderTiptapContent((doc as any).content || []);
    if (!children) return null;

    // Her child için key vererek React uyarısını temizliyoruz
    return (
      <>
        {children.map((child: any, index: number) => (
          <span key={index}>{child}</span>
        ))}
      </>
    );
  }

  // TipTap doc değilse ya da parse edilemezse: düz metin olarak göster
  return bio;
}


  
 export default function AuthorBlock(

  { author, workerId, locale, authorId }: { author: Author | null; workerId?: string | null; locale?: "tr" | "en"; authorId?: string | null }
 ) {
   if (!author) return null;
const t = useTranslations("AuthorBlock");
   const [showBio, setShowBio] = useState(false);
   const [showFullImg, setShowFullImg] = useState(false);
   const [showCv, setShowCv] = useState(false);
   const bioBtnRef = useRef<HTMLButtonElement | null>(null);
   const bioPanelRef = useRef<HTMLDivElement | null>(null);
 const [uiLocale, setUiLocale] = useState<"tr" | "en">(locale === "en" ? "en" : "tr");
  const isWorkerAuthor = !!workerId && !author.bio;
  
  // Dışarı tıklanınca bio panelini kapat
   useEffect(() => {
     if (!showBio) return;
     const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
       if (bioBtnRef.current?.contains(t)) return;
      if (bioPanelRef.current?.contains(t)) return;
       setShowBio(false);
    };
     document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showBio]);

 // Etkin dil: prop > <html lang> > "tr"
  useEffect(() => {
    setUiLocale(locale === "en" ? "en" : "tr");
  }, [locale]);

   return (
     <div className="mb-6 flex items-start gap-3">
         <div
        role="button"
        tabIndex={0}
        onClick={() => setShowFullImg(true)}
         className="relative block shrink-0 w-12 h-12 rounded-full overflow-hidden border border-gray-200 self-start"
       style={{ padding: 0, lineHeight: 0, background: "transparent" }}
        title={author.name || undefined}
         aria-label={t("avatarAria")}
    >
       {author.avatar_url ? (
         <div className="absolute inset-0">
            <Image
             src={author.avatar_url}
              alt={author.name || t("authorAlt")}
              fill
               className="block object-cover object-top"
style={{ objectPosition: "50% 45%" }}
            draggable={false}
              unoptimized
           />
          </div>
       ) : (
          <div className="absolute inset-0 grid place-items-center text-[10px] text-gray-400 bg-gray-100">
         {t("none")}
         </div>
       )}
</div>
 
       {/* İsim, unvan ve bio aç/kapa */}
     <div className="min-w-0">
        <div className="text-sm text-gray-700 leading-tight">
          <div className="font-semibold text-gray-900">
           {author.name || "—"}
         </div>
          {author.title ? ( <div className="text-gray-600">{author.title}</div> ) : null}
        </div>
 
       {/* Yazar hakkında – ünvanın hemen altında ince buton (her zaman göster) */}
             <div className="mt-1 flex items-center gap-2 flex-wrap">
         {/* 1) Yazar hakkında */}
         <button
           ref={bioBtnRef}
           type="button"
           onClick={() =>
             (isWorkerAuthor ? setShowCv(true) : (author.bio ? setShowBio((s) => !s) : null))
           }
           className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-5 text-slate-600 hover:bg-slate-50"
         >
           {t("aboutAuthor")}
         </button>

         {/* 2) Tüm yazıları — aynı stil, aynı satır */}
         {(authorId || workerId) && (
           <Link
             href={`/blog/author/${authorId ?? workerId}`}
             className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-5 text-slate-600 hover:bg-slate-50"
           >
             {t("allPosts")}
           </Link>
         )}
             </div>
     </div>


      {/* Basit full-screen görsel modalı (dikdörtgen, kırpmasız) */}
           {showFullImg && (
        <div
          className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4"
         onClick={() => setShowFullImg(false)}
       >
         <div
             className="relative max-h-[90vh] max-w-[90vw] rounded-xl overflow-hidden bg-white"
            onClick={(e) => e.stopPropagation()}
          >
           {author.avatar_url ? (
             <Image
                src={author.avatar_url}
              alt={author.name || t("authorAlt")}
                width={1200}
               height={1200}
               className="h-auto w-auto max-h-[90vh] max-w-[90vw] object-contain"
                unoptimized
              />
           ) : (
              <div className="p-10 text-sm text-gray-600">{t("noImage")}</div>
           )}
            <button
               type="button"
             onClick={() => setShowFullImg(false)}
              className="absolute top-2 right-2 rounded-full bg-white/90 px-2 py-1 text-xs shadow"
            >
             {t("close")}
            </button>
          </div>
       </div>
     )}

      {/* Yazar Hakkında Modal — worker CV ile aynı genişlik */}
      {showBio && author.bio && !isWorkerAuthor && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowBio(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div
              ref={bioPanelRef}
              className="w-[min(100%,900px)] rounded-xl bg-white shadow-2xl max-h-[80vh] overflow-auto"
            >
              <div className="flex items-center justify-between border-b p-3">
                <div className="text-sm font-medium">{t("aboutAuthor")}</div>
                <button
                  type="button"
                  onClick={() => setShowBio(false)}
                  className="rounded-md bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200"
                  aria-label={t("close")}
                >
                  {t("close")}
                </button>
              </div>
              <div className="p-4">
                <div className="prose prose-sm max-w-full text-gray-700">
                  {renderAuthorBioContent(author.bio)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

	  {/* CV Önizleme Modal (Ask sayfasındakiyle aynı davranış) */}
 {showCv && workerId ? (

   <div className="fixed inset-0 z-40">
     <div className="absolute inset-0 bg-black/40" onClick={() => setShowCv(false)} />
     <div className="absolute inset-0 flex items-center justify-center p-4">
       <div className="w-[min(100%,900px)] rounded-xl bg-white shadow-2xl">
         <div className="flex items-center justify-between border-b p-3">
           <div className="text-sm font-medium">{t("cvPreviewTitle")}</div>
           <button
             type="button"
             onClick={() => setShowCv(false)}
             className="rounded-md bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200"
              aria-label={t("close")}
           >
          {t("close")}
           </button>
         </div>
         <div className="max-h-[80vh] overflow-auto p-4">
           <CvPreviewById workerId={workerId} locale={uiLocale} />
         </div>
       </div>
     </div>
   </div>
 ) : null}
    </div>
  );
 }
