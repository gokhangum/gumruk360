// lib/blog/rpc.ts
import { supabaseServer } from "@/lib/supabase/server";

export type BlogDraftInput = {
  tenant_id: string | null;
  lang: string;
  title: string;
  slug?: string | null;
  summary?: string | null;
  content_json: any; // Tiptap JSON
  tags?: string[] | null;
  keywords?: string[] | null;
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url_override?: string | null;
};

export async function blogCreateDraft(input: BlogDraftInput) {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("fn_blog_create_draft", {
    p_tenant_id: input.tenant_id,
    p_lang: input.lang,
    p_title: input.title,
    p_slug: input.slug ?? null,
    p_summary: input.summary ?? null,
    p_content_json: input.content_json,
    p_tags: input.tags ?? null,
    p_keywords: input.keywords ?? null,
    p_seo_title: input.seo_title ?? null,
    p_seo_description: input.seo_description ?? null,
    p_canonical_url_override: input.canonical_url_override ?? null,
  });
  if (error) throw error;
  return data as string; // post_id (uuid)
}

export type BlogUpdateInput = {
  id: string;
  title?: string | null;
  slug?: string | null;
  summary?: string | null;
  content_json?: any | null;
  tags?: string[] | null;
  keywords?: string[] | null;
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url_override?: string | null;
  lang?: string | null;
  tenant_id?: string | null;
};

export async function blogUpdateMine(input: BlogUpdateInput) {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("fn_blog_update_mine", {
    p_id: input.id,
    p_title: input.title ?? null,
    p_slug: input.slug ?? null,
    p_summary: input.summary ?? null,
    p_content_json: input.content_json ?? null,
    p_tags: input.tags ?? null,
    p_keywords: input.keywords ?? null,
    p_seo_title: input.seo_title ?? null,
    p_seo_description: input.seo_description ?? null,
    p_canonical_url_override: input.canonical_url_override ?? null,
    p_lang: input.lang ?? null,
    p_tenant_id: input.tenant_id ?? null,
  });
  if (error) throw error;
}

export async function blogSubmitForReview(id: string) {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("fn_blog_submit_for_review", { p_id: id });
  if (error) throw error;
}

export async function blogAdminPublish(id: string, publishedAt?: string | null) {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("fn_blog_admin_publish", {
    p_id: id,
    p_published_at: publishedAt ?? null,
  });
  if (error) throw error;
}

export async function blogAdminSchedule(id: string, scheduledAt: string) {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("fn_blog_admin_schedule", {
    p_id: id,
    p_scheduled_at: scheduledAt,
  });
  if (error) throw error;
}

export async function blogAdminArchive(id: string) {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("fn_blog_admin_archive", { p_id: id });
  if (error) throw error;
}
