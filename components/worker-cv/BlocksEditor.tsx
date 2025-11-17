"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
type Block = {
  id?: string;
  lang: string;            // 'tr' | 'en'
  block_type: string;      // key
  body_rich: any;
  order_no: number;
};

type BlockType = {
  id: string;
  key: string;
  title_tr: string;
  title_en: string;
  order_no: number;
};

function labelFor(lang: string, t: BlockType) {
  if (lang === "en") return (t.title_en && t.title_en.trim()) || (t.title_tr && t.title_tr.trim()) || t.key;
  return (t.title_tr && t.title_tr.trim()) || (t.title_en && t.title_en.trim()) || t.key;
}

// Convert plain text to a simple rich "doc" with paragraph nodes.
function plainTextToDoc(txt: string) {
  const safe = (txt || "").replace(/\r\n/g, "\n");
  const parts = safe.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
  const paragraphs = parts.map(p => ({ type: "paragraph", content: [{ type: "text", text: p }] }));
  return { type: "doc", content: paragraphs.length ? paragraphs : [{ type: "paragraph" }] };
}
function toBodyRich(input: string) {
  const s = (input ?? "").trim();
  if (!s) return { type: "doc", content: [{ type: "paragraph" }] };
  if (s.startsWith("{") || s.startsWith("[")) {
    try { return JSON.parse(s); } catch {}
  }
  return plainTextToDoc(s);
}

// NEW: treat a single empty paragraph doc as blank
function isBlankDoc(doc: any): boolean {
  try {
    if (!doc || doc.type !== "doc") return false;
    if (!Array.isArray(doc.content)) return false;
    if (doc.content.length !== 1) return false;
    const p = doc.content[0];
    return p?.type === "paragraph" && (!p.content || p.content.length === 0);
  } catch {
    return false;
  }
}

function docToPrettyInput(doc: any): string {
  try {
    // If it's just an empty paragraph, show empty input
    if (isBlankDoc(doc)) return "";
    const paras = (doc?.content || [])
      .filter((n: any) => n?.type === "paragraph")
      .map((n: any) => (n.content || []).map((c: any) => c.text || "").join(""))
      .filter((s: string) => s && s.trim().length > 0);
    if (paras.length) return paras.join("\n\n");
  } catch {}
  try { return JSON.stringify(doc, null, 2); } catch { return ""; }
}

export default function BlocksEditor() {
	const t = useTranslations("workerCv.blocksEditor");
  const [list, setList] = useState<Array<any>>([]);
  const [types, setTypes] = useState<BlockType[]>([]);
  const [bodyInputs, setBodyInputs] = useState<Record<string, string>>({});
  const [flashSaved, setFlashSaved] = useState<Record<string, boolean>>({}); // id -> transient "saved" badge
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/worker/cv/blocks`, { cache: "no-store" });
    const j = await res.json();
    if (j.ok) {
      const rows: any[] = j.data || [];
      setList(rows);
      const m: Record<string,string> = {};
      for (const r of rows) {
        const id = r.id as string | undefined;
        if (id) m[id] = docToPrettyInput(r.body_rich);
      }
      setBodyInputs(m);
    }
  }

  async function loadTypes() {
    const r = await fetch("/api/cv/block-types", { cache: "no-store" });
    const j = await r.json();
    if (j.ok) setTypes(j.data || []);
  }

  useEffect(() => { load(); loadTypes(); }, []);

  async function saveBlock(b: any) {
    if (!b.id) return;
    const type = types.find(t => t.key === b.block_type);
    const input = bodyInputs[b.id] ?? "";
    const payload = {
      ...b,
      order_no: type?.order_no ?? b.order_no,
      body_rich: toBodyRich(input)
    };
    const res = await fetch(`/api/worker/cv/blocks/${b.id}`, { method: "PUT", body: JSON.stringify(payload) });
    const j = await res.json();
    if (!j.ok) setMsg(j.error || t("updateFailed"));
    else {
      setFlashSaved(prev => ({ ...prev, [b.id]: true }));
      setTimeout(() => setFlashSaved(prev => ({ ...prev, [b.id]: false })), 2000);
    }
  }

  async function deleteBlock(b: any) {
    if (!b.id) return;
    if (!confirm(t("deleteConfirm"))) return;
    const res = await fetch(`/api/worker/cv/blocks/${b.id}`, { method: "DELETE" });
    const j = await res.json();
    if (!j.ok) setMsg(j.error || t("deleteFailed"));
    else {
      setList(ls => ls.filter(x => (x as any).id !== b.id));
      setFlashSaved(prev => { const cp = { ...prev }; delete cp[b.id]; return cp; });
    }
  }

  return (
    <div className="border rounded space-y-4 px-1 py-3 md:px-5 md:py-4">
      {/* Başlık satırı + sağda Önizleme butonu */}
      <div className="flex items-center justify-between">
        <div className="font-medium">{t("title")}</div>
        <Link href="/worker/cv/preview" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 shadow-sm">
          {t("preview")}
        </Link>
      </div>

      {/* Yeni Blok bölümü worker için KALDIRILDI */}

      <div className="space-y-3">
        {list.map((b: any) => {
          const tp = types.find(x=>x.key===b.block_type);
          const inputVal = bodyInputs[b.id] ?? docToPrettyInput(b.body_rich);
          const saved = !!flashSaved[b.id];
          return (
          <div key={b.id} className="border rounded p-3 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1">
                <span>{t("lang")}</span>
                <select className="border rounded p-2" value={b.lang} onChange={e=>setList(ls=>ls.map(x=>(x as any).id===b.id?{...x, lang:e.target.value}:x))}>
                  <option value="tr">TR</option>
                  <option value="en">EN</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>{t("type")}</span>
                <select
                  className="border rounded p-2"
                  value={b.block_type}
                  onChange={e=>{
                    const key = e.target.value;
                    const sel = types.find(x=>x.key===key);
                    setList(ls=>ls.map(x=>(x as any).id===b.id?{...x, block_type:key, order_no: sel?.order_no ?? (x as any).order_no}:x));
                  }}
                >
                 <option value="">{t("select")}</option>
                  {types.map(tp => <option key={tp.id} value={tp.key}>{labelFor(b.lang, tp)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>{t("order")}</span>
                            <input className="border rounded p-2 bg-gray-50" value={tp?.order_no ?? b.order_no} readOnly />

              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span>{t("content")}</span>
              <textarea
                className="border rounded p-2 min-h-[100px]"
                placeholder={t("contentPlaceholder")}
                value={inputVal}
                onChange={e=>{
                  const id = b.id as string;
                  setBodyInputs(prev => ({ ...prev, [id]: e.target.value }));
                }}
              />
            </label>
            <div className="flex items-center gap-3">
             <button onClick={()=>saveBlock(b)} className="px-3 py-2 bg-black text-white rounded">{t("save")}</button>

         

              {saved && <span className="text-sm text-green-700">{t("saved")}</span>}
            </div>
          </div>
        )})}
      </div>

      {msg && <div className="text-sm text-gray-600">{msg}</div>}
    </div>
  );
}
