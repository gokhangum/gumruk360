"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
function docToPrettyInput(doc: any): string {
  try {
    const paras = (doc?.content || [])
      .filter((n: any) => n?.type === "paragraph")
      .map((n: any) => (n.content || []).map((c: any) => c.text || "").join(""))
      .filter((s: string) => s && s.trim().length > 0);
    if (paras.length) return paras.join("\n\n");
  } catch {}
  try { return JSON.stringify(doc, null, 2); } catch { return ""; }
}

export default function AdminBlocksEditor({ workerId }: { workerId: string }) {
  const [list, setList] = useState<Block[]>([]);
  const [types, setTypes] = useState<BlockType[]>([]);
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({}); // id -> saved
  const [newSaved, setNewSaved] = useState<string | null>(null); // message for new block
  const [bodyInputs, setBodyInputs] = useState<Record<string, string>>({});
  const [newBlock, setNewBlock] = useState<Block>({
    lang: "tr",
    block_type: "",
    body_rich: { type: "doc", content: [] },
    order_no: 0
  });
  const [newBodyInput, setNewBodyInput] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/admin/consultants/${workerId}/cv/blocks`, { cache: "no-store" });
    const j = await res.json();
    if (j.ok) {
      const rows: any[] = j.data || [];
      setList(rows);
      const m: Record<string,string> = {};
      const s: Record<string, boolean> = {};
      for (const r of rows) {
        const id = r.id as string | undefined;
        if (id) {
          m[id] = docToPrettyInput(r.body_rich);
          s[id] = true; // DB'de zaten kayıtlı -> Kaydedildi rozeti
        }
      }
      setBodyInputs(m);
      setSavedMap(s);
    }
  }

  async function loadTypes() {
    const r = await fetch("/api/cv/block-types", { cache: "no-store" });
    const j = await r.json();
    if (j.ok) {
      const arr: BlockType[] = j.data || [];
      setTypes(arr);
      setNewBlock((nb)=> {
        const firstKey = (arr?.[0]?.key || "");
        return {...nb, block_type: firstKey, order_no: (arr?.[0]?.order_no ?? 0)};
      });
    }
  }

  useEffect(() => { load(); loadTypes(); }, [workerId]);

  const selectedTypeForNew = useMemo(
    () => types.find(t => t.key === newBlock.block_type) || null,
    [types, newBlock.block_type]
  );

  async function addBlock() {
    setMsg(null);
    setNewSaved(null);
    if (!newBlock.block_type) { setMsg("Lütfen blok türü seçin."); return; }
    const type = types.find(t => t.key === newBlock.block_type);
    const payload = {
      ...newBlock,
      order_no: type?.order_no ?? 0,
      body_rich: toBodyRich(newBodyInput)
    };
    const res = await fetch(`/api/admin/consultants/${workerId}/cv/blocks`, { method: "POST", body: JSON.stringify(payload) });
    const j = await res.json();
    if (!j.ok) setMsg(j.error || "Blok eklenemedi.");
    else {
      setNewSaved("Kaydedildi ✔");
      const first = types[0];
      setNewBlock({
        lang: newBlock.lang,
        block_type: first?.key || "",
        body_rich: { type: "doc", content: [] },
        order_no: first?.order_no ?? 0
      });
      setNewBodyInput("");
      await load();
      setTimeout(()=> setNewSaved(null), 2000);
    }
  }

  async function saveBlock(b: any) {
    if (!b.id) return;
    const type = types.find(t => t.key === b.block_type);
    const input = bodyInputs[b.id] ?? "";
    const payload = {
      ...b,
      order_no: type?.order_no ?? b.order_no,
      body_rich: toBodyRich(input)
    };
    const res = await fetch(`/api/admin/consultants/${workerId}/cv/blocks/${b.id}`, { method: "PUT", body: JSON.stringify(payload) });
    const j = await res.json();
    if (!j.ok) setMsg(j.error || "Blok güncellenemedi.");
    else {
      setSavedMap(prev => ({ ...prev, [b.id]: true }));
      setTimeout(()=> setSavedMap(prev => ({ ...prev, [b.id]: true })), 0); // ensure render
    }
  }

  async function deleteBlock(b: any) {
    if (!b.id) return;
    if (!confirm("Bu CV bloğunu silmek istediğinize emin misiniz?")) return;
    const res = await fetch(`/api/admin/consultants/${workerId}/cv/blocks/${b.id}`, { method: "DELETE" });
    const j = await res.json();
    if (!j.ok) setMsg(j.error || "Silme başarısız.");
    else {
      setList(ls => ls.filter(x => (x as any).id !== b.id));
      setSavedMap(prev => {
        const cp = { ...prev };
        delete cp[b.id];
        return cp;
      });
    }
  }

  return (
    <div className="border rounded p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-medium">CV Blokları (Admin)</div>
        <Link href={`/admin/consultants/${workerId}/preview`} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Önizleme</Link>
      </div>

      <div className="border rounded p-3 space-y-2">
        <div className="font-medium text-sm">Yeni Blok</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span>Dil</span>
            <select className="border rounded p-2" value={newBlock.lang} onChange={e=>setNewBlock({...newBlock, lang:e.target.value})}>
              <option value="tr">TR</option>
              <option value="en">EN</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>Tür</span>
            <select
              className="border rounded p-2"
              value={newBlock.block_type}
              onChange={e=>{
                const key = e.target.value;
                const t = types.find(x=>x.key===key);
                setNewBlock({...newBlock, block_type:key, order_no: t?.order_no ?? 0});
              }}
            >
              <option value="">Seçiniz</option>
              {types.map(t => <option key={t.id} value={t.key}>{labelFor(newBlock.lang, t)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>Sıra</span>
            <input
              className="border rounded p-2 bg-gray-50"
              value={selectedTypeForNew?.order_no ?? 0}
              readOnly
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span>İçerik</span>
          <textarea
            className="border rounded p-2 min-h-[120px]"
            placeholder="Metin/HTML yapıştırabilir veya JSON doküman verebilirsiniz."
            value={newBodyInput}
            onChange={e=>setNewBodyInput(e.target.value)}
          />
          <div className="text-xs text-gray-500">
            Not: JSON girerseniz aynen kaydedilir; aksi halde metin otomatik paragraf düğümlerine dönüştürülür.
          </div>
        </label>
        <div className="flex items-center gap-3">
          <button onClick={addBlock} className="px-3 py-2 bg-black text-white rounded">Ekle</button>
          {newSaved && <span className="text-sm text-green-700">{newSaved}</span>}
        </div>
      </div>

      <div className="space-y-3">
        {list.map((b: any) => {
          const t = types.find(x=>x.key===b.block_type);
          const inputVal = bodyInputs[b.id] ?? docToPrettyInput(b.body_rich);
          const saved = !!savedMap[b.id];
          return (
          <div key={b.id} className="border rounded p-3 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1">
                <span>Dil</span>
                <select className="border rounded p-2" value={b.lang} onChange={e=>setList(ls=>ls.map(x=>(x as any).id===b.id?{...x, lang:e.target.value}:x))}>
                  <option value="tr">TR</option>
                  <option value="en">EN</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>Tür</span>
                <select
                  className="border rounded p-2"
                  value={b.block_type}
                  onChange={e=>{
                    const key = e.target.value;
                    const sel = types.find(x=>x.key===key);
                    setList(ls=>ls.map(x=>(x as any).id===b.id?{...x, block_type:key, order_no: sel?.order_no ?? (x as any).order_no}:x));
                  }}
                >
                  <option value="">Seçiniz</option>
                  {types.map(tp => <option key={tp.id} value={tp.key}>{labelFor(b.lang, tp)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>Sıra</span>
                <input className="border rounded p-2 bg-gray-50" value={t?.order_no ?? b.order_no} readOnly />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span>İçerik</span>
              <textarea
                className="border rounded p-2 min-h-[100px]"
                placeholder="Metin/HTML yapıştır veya JSON ver"
                value={inputVal}
                onChange={e=>{
                  const id = b.id as string;
                  setBodyInputs(prev => ({ ...prev, [id]: e.target.value }));
                }}
              />
              <div className="text-xs text-gray-500">JSON vermezsen metin otomatik paragraf dokümanına çevrilir.</div>
            </label>
            <div className="flex items-center gap-3">
              <button onClick={()=>saveBlock(b)} className="px-3 py-2 bg-black text-white rounded">Kaydet</button>
              <button onClick={()=>deleteBlock(b)} className="px-3 py-2 border rounded hover:bg-gray-50">Sil</button>
              {saved && <span className="text-sm text-green-700">Kaydedildi ✔</span>}
            </div>
          </div>
        )})}
      </div>

      {msg && <div className="text-sm text-gray-600">{msg}</div>}
    </div>
  );
}
