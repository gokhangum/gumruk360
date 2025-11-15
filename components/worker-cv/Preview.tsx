
"use client";
import { useEffect, useMemo, useState } from "react";
import {useTranslations} from "next-intl";
type Block = {
  id: string;
  lang: "tr" | "en";
  block_type: string;
  body_rich: any;
  order_no: number;
};
type BlockType = { id: string; key: string; title_tr: string; title_en: string; order_no: number };
type Profile = { display_name: string; title_tr?: string; title_en?: string; tags?: string[] | null };

function richToParagraphs(doc: any): string[] {
  try {
    const nodes = Array.isArray(doc?.content) ? doc.content : [];
    const paras: string[] = [];
    for (const n of nodes) {
      if (n?.type === "paragraph") {
        const text = (n.content || []).map((c: any) => (c?.text ?? "")).join("");
        if (text && text.trim()) paras.push(text.trim());
      }
    }
    if (paras.length) return paras;
  } catch {}
  try {
    const s = typeof doc === "string" ? doc : JSON.stringify(doc);
    return s ? [s] : [];
  } catch { return []; }
}

export default function WorkerCvPreview() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [types, setTypes] = useState<BlockType[]>([]);
  const [lang, setLang] = useState<"tr"|"en">("tr");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
const t = useTranslations('workerCv.preview');
  useEffect(() => {
    (async () => {
      try {
        const pr = await fetch("/api/worker/cv/profile", { cache: "no-store" });
        const pt = await pr.text();
        const pj = pt ? JSON.parse(pt) : { ok: pr.ok };
        if (pj.ok && pj.data) setProfile(pj.data);
      } catch {}
      try {
        const br = await fetch("/api/worker/cv/blocks", { cache: "no-store" });
        const bj = await br.json();
        if (bj.ok && bj.data) setBlocks(bj.data || []);
      } catch {}
      try {
        const tr = await fetch("/api/cv/block-types", { cache: "no-store" });
        const tj = await tr.json();
        if (tj.ok && tj.data) setTypes(tj.data || []);
      } catch {}
      try {
        const fr = await fetch(`/api/worker/cv/photo/url?ts=${Date.now()}`, { cache: "no-store" });
        const ft = await fr.text();
        const fj = ft ? JSON.parse(ft) : { ok: fr.ok };
        if (fj.ok && fj.url) setPhotoUrl(fj.url);
      } catch {}
    })();
  }, []);

  const blocksForLang = useMemo(() => {
    const arr = blocks.filter(b => (b.lang as any) === lang);
    const byKey: Record<string, BlockType | undefined> = Object.fromEntries(types.map(t=>[t.key, t]));
    return arr.sort((a, b) => {
      const ta = byKey[a.block_type]?.order_no ?? a.order_no ?? 0;
      const tb = byKey[b.block_type]?.order_no ?? b.order_no ?? 0;
      if (ta !== tb) return ta - tb;
      if (a.order_no !== b.order_no) return (a.order_no ?? 0) - (b.order_no ?? 0);
      return (a.id || "").localeCompare(b.id || "");
    });
  }, [blocks, types, lang]);

  function titleFor(key: string) {
    const t = types.find(x=>x.key===key);
    if (!t) return key;
    return lang === "en" ? (t.title_en?.trim() || t.title_tr || t.key) : (t.title_tr?.trim() || t.title_en || t.key);
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <div className="inline-flex gap-2 rounded-xl border p-1 bg-white shadow-sm">
          <button
            className={"px-3 py-1 rounded-lg " + (lang==="tr" ? "bg-black text-white" : "hover:bg-gray-50")}
            onClick={()=>setLang("tr")}
          >TR</button>
          <button
            className={"px-3 py-1 rounded-lg " + (lang==="en" ? "bg-black text-white" : "hover:bg-gray-50")}
            onClick={()=>setLang("en")}
          >EN</button>
        </div>
      </div>

      {/* Profile card */}
      <div className="border rounded-2xl p-4 md:p-6 mb-6 shadow-sm bg-white">
        <div className="flex items-start gap-4">
          {/* 5x6 boyut: w-20 (5), h-24 (6) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl || "/placeholder-avatar.png"}
            alt={t('ui.photoAlt')}
            className="w-20 h-24 rounded-md object-cover border"
          />
          <div className="flex-1">
            <div className="text-2xl font-semibold">{profile?.display_name || "—"}</div>
            <div className="text-gray-600">
              {lang==="en" ? (profile?.title_en || "") : (profile?.title_tr || "")}
            </div>
            {(profile?.tags?.length ?
              <div className="mt-3">
                <span className="font-semibold mr-2">{t('labels.specialties')}:</span>
                <span className="inline-flex flex-wrap gap-2 align-middle">
                  {profile.tags!.map((t, i)=>(
                    <span key={i} className="text-xs px-2 py-1 rounded-full border bg-gray-50">{t}</span>
                  ))}
                </span>
              </div>
            : null)}
          </div>
        </div>
      </div>

      {/* Blocks */}
      <div className="space-y-6">
        {blocksForLang.map(b => {
          const paras = richToParagraphs(b.body_rich);
          return (
            <section key={b.id} className="border rounded-2xl p-4 md:p-6 bg-white shadow-sm">
              <h2 className="text-lg font-semibold mb-2">{titleFor(b.block_type)}</h2>
              <div className="prose prose-sm max-w-none">
                {paras.length ? paras.map((p, i)=>(<p key={i} className="whitespace-pre-wrap">{p}</p>)) : <p>—</p>}
              </div>
            </section>
          );
        })}
        {(!blocksForLang.length) ? (
          <div className="text-sm text-gray-500">{t('empty')}</div>
        ) : null}
      </div>
    </div>
  );
}
