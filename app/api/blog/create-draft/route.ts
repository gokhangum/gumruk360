// app/api/blog/create-draft/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { slugifyTr as slugify } from "@/lib/slug";
import { autoMeta } from "@/lib/seo/autoMeta";
import { getTranslations } from "next-intl/server";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = await supabaseServer();
const rawSlug = (body?.slug ?? body?.title ?? "").toString();
const pSlug = rawSlug ? slugify(rawSlug) : null;
    // === AUTO META: content_json içinden düz metin çıkar + boş alanlar için otomatik doldur ===
    const preferredLang: "tr" | "en" =
      (body?.lang || "tr").toString().toLowerCase().startsWith("en") ? "en" : "tr";
const t = await getTranslations({ locale: preferredLang, namespace: "admin.blog.api.createDraft" });
    // tiptap benzeri JSON -> düz metin
    function tiptapToText(node: any): string {
      try {
        if (!node) return "";
        if (typeof node === "string") return node;
        if (Array.isArray(node)) return node.map(tiptapToText).join(" ");
        if (typeof node === "object") {
          const self = (node.text || "");
          const inner = tiptapToText(node.content || []);
          return [self, inner].filter(Boolean).join(" ");
        }
        return "";
      } catch {
        return "";
      }
    }

    const contentText = body.content_text ?? tiptapToText(body.content_json) ?? "";

    const meta = autoMeta({
      title: body.title,
      contentText,
      preferredLang,
      knownTags: (t.raw("meta.knownTags") as string[]),
    });

    const pSummary   = body.summary ?? meta.summary;
    const pSeoTitle  = body.seo_title ?? meta.seoTitle;
    const pSeoDesc   = body.seo_description ?? meta.seoDescription;
    const pKeywords  = body.keywords ?? meta.keywords;
    const pTags      = body.tags ?? meta.tags;

    const { data, error } = await supabase.rpc("fn_blog_create_draft", {
      p_title: body.title,                 // zorunlu
      p_lang: body.lang,                   // zorunlu
      p_tenant_id: body.tenant_id ?? null, // opsiyonel
           p_slug: pSlug,
      p_summary: pSummary,
      p_content_json: body.content_json ?? { type: "doc", content: [] },
      p_tags: pTags,
      p_keywords: pKeywords,
      p_seo_title: pSeoTitle,
      p_seo_description: pSeoDesc,
      p_canonical_url_override: body.canonical_url_override ?? null,

    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "ERR" }, { status: 500 });
  }
}
