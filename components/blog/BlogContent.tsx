
// components/blog/BlogContent.tsx
import React from "react";
import ImageLightbox from "@/components/blog/ImageLightbox";
import { resolvePublicUrl } from "@/lib/storage/resolvePublicUrl";
type Node = any;
function normalizeHref(href: string): string {
  if (!href) return href;
  try {
    // ENV base'lerini ve herhangi bir localhost:port origin'ini sıyır
    const trBase = process.env.APP_BASE_URL_TR ? new URL(process.env.APP_BASE_URL_TR) : null;
    const enBase = process.env.APP_BASE_URL_EN ? new URL(process.env.APP_BASE_URL_EN) : null;
    const u = new URL(href, trBase?.origin || 'http://localhost');

    const isLocal =
      u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
    const matchesEnv =
      (trBase && u.origin === trBase.origin) || (enBase && u.origin === enBase.origin);

    if (isLocal || matchesEnv) {
      // origin'i atıp yalnızca path+query+hash bırak
      return `${u.pathname}${u.search}${u.hash}`;
    }
    return href;
  } catch {
    return href; // mutlak değilse veya URL parse edilemezse bırak
  }
}


function TextRun({ node }: { node: any }) {
  if (!node) return null;
  const text = node.text || "";
  const marks = node.marks || [];
  let el: React.ReactNode = text;
  marks.forEach((m: any) => {
    if (m.type === "bold") el = <strong>{el}</strong>;
    if (m.type === "italic") el = <em>{el}</em>;
    if (m.type === "code") el = <code>{el}</code>;
   if (m.type === "link") {
  const rawHref = m.attrs?.href || "";
  const href = normalizeHref(rawHref);

  // İç linkleri aynı sekmede, dış linkleri yeni sekmede aç
  const isExternal =
    /^https?:\/\//i.test(href) && !href.startsWith('/');

  el = (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
    >
      {el}
    </a>
  );
}

  });
  return <>{el}</>;
}

function Paragraph({ node }: { node: Node }) {
  return <p>{(node.content || []).map((c: any, i: number) => <TextRun key={i} node={c} />)}</p>;
}

function Heading({ node }: { node: Node }) {
  const level = node.attrs?.level ?? 2;
  const Tag: any = `h${Math.min(Math.max(level,1),6)}`;
  return <Tag>{(node.content || []).map((c: any, i: number) => <TextRun key={i} node={c} />)}</Tag>;
}

function Blockquote({ node }: { node: Node }) {
  return <blockquote className="border-l-4 pl-3 italic text-gray-700">{(node.content || []).map((c: any, i: number) => <Paragraph key={i} node={c} />)}</blockquote>;
}

function CodeBlock({ node }: { node: Node }) {
  return <pre className="bg-gray-100 rounded p-3 overflow-auto"><code>{node.content?.map((c:any)=>c.text).join("")}</code></pre>;
}

function BulletList({ node }: { node: Node }) {
  return <ul className="list-disc pl-6">{(node.content || []).map((li: any, i: number) => <li key={i}>{li.content?.[0]?.content?.map((c:any, j:number)=> <TextRun key={j} node={c}/>)}</li>)}</ul>;
}

function OrderedList({ node }: { node: Node }) {
  return <ol className="list-decimal pl-6">{(node.content || []).map((li: any, i: number) => <li key={i}>{li.content?.[0]?.content?.map((c:any, j:number)=> <TextRun key={j} node={c}/>)}</li>)}</ol>;
}

function ImageNode({ node, open }: { node: Node; open: (src: string, alt?: string) => void }) {
  const raw = node.attrs?.src as string | undefined;
  const src = resolvePublicUrl(raw || undefined);
  const alt = node.attrs?.alt || "";
  const title = node.attrs?.title || "";
  const float = node.attrs?.float || "none";
  if (!src) return null;
return (
  <>
    <img
      src={src}
      alt={node.attrs.alt || ""}
      className={`tiptap-image ${float !== "none" ? `float-${float}` : ""} rounded-xl max-w-full cursor-zoom-in`}
      style={float !== "none" ? { float: float as "left" | "right" } : undefined}
    />
    {node.attrs.caption ? (
      <div className="text-sm text-gray-500 mt-2">{node.attrs.caption}</div>
    ) : null}
  </>
);
}

export default function BlogContent({ doc }: { doc: any }) {
  if (!doc || !Array.isArray(doc.content)) return null;
  return (
 <div className="prose max-w-none">
      <ImageLightbox>
         {(open) => (
         <>
             {doc.content.map((node: Node, i: number) => {
             switch (node.type) {
               case "paragraph":   return <Paragraph   key={i} node={node} />;
                 case "heading":     return <Heading     key={i} node={node} />;
                case "blockquote":  return <Blockquote  key={i} node={node} />;
                 case "codeBlock":   return <CodeBlock   key={i} node={node} />;
                 case "bulletList":  return <BulletList  key={i} node={node} />;
                case "orderedList": return <OrderedList key={i} node={node} />;
                 case "image":       return <ImageNode   key={i} node={node} open={open} />;
                default:
                  return <div key={i} className="text-xs text-gray-400">[Unsupported node: {node.type}]</div>;
              }
             })}
           </>
        )}
       </ImageLightbox>
    </div>
  );
}
