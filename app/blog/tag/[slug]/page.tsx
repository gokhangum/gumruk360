
export const runtime = "nodejs";

import Link from "next/link";
import type { Metadata } from "next";
import {
   absUrl,
 getListTitle as listTitle,
 getListDescription as listDescription,
  itemListJsonLd
} from "../../seo";
import { headers } from "next/headers";
import { listPublicPosts } from "../../server"; // Fallback

 async function absFetchPath(path: string) {
  const hdrs = await headers();
 const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") || (/^(localhost|127\.0\.0\.1)/i.test(host) ? "http" : "https");
  const base = `${proto}://${host}`;
  return new URL(path, base).toString();
 }

type Search = { [key: string]: string | string[] | undefined };
const val = (sp: Search, k: string) => Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined);

export const revalidate = 30;

export async function generateMetadata({ params, searchParams }: { params: { slug: string }, searchParams?: Search }): Promise<Metadata> {
  const sp = searchParams || {};
  const page   = Number(val(sp, "page") ?? "1") || 1;
  const tag = params.slug;

 const title = await listTitle();
const description = await listDescription();
  const canonical = await absUrl(`/blog/tag/${encodeURIComponent(tag)}` + buildQuery({ page: page > 1 ? page : undefined }));

  const robots = (page > 1) ? { index: false, follow: true } : { index: true, follow: true };

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description },
    robots,
  };
}

function buildQuery(obj: Record<string, any>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v != null && v !== "") params.set(k, String(v));
  const qs = params.toString();
  return qs ? "?" + qs : "";
}

async function fetchList(tag: string, sp: Search) {
  const page   = Number(val(sp, "page") ?? "1") || 1;
  const limit  = Math.min(Math.max(Number(val(sp, "limit") ?? "10"), 1), 50);
  const lang   = val(sp, "lang") || "tr-TR";
  const tenant = val(sp, "tenant");

  // 1) Try data route
  try {
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("limit", String(limit));
    qs.set("tag", tag);
    if (lang) qs.set("lang", lang);
    if (tenant) qs.set("tenant", tenant);

    const url = await absFetchPath(`/blog/_data?${qs.toString()}`);
    const res = await fetch(url, { next: { tags: ["blog"] } });
    const ctype = res.headers.get("content-type") || "";
    if (!res.ok || !ctype.includes("application/json")) {
      throw new Error(`Unexpected response: status ${res.status}, ctype ${ctype}`);
    }
    const json = await res.json();
    return { items: json.items || [], total: json.total || 0, page, limit };
  } catch {
    // 2) Fallback: direct server call
    const { items, total } = await listPublicPosts({
      lang,
      tenant: tenant || undefined,
      tag,
      page,
      pageSize: limit,
    });
    return { items, total, page, limit };
  }
}

export default async function BlogTagPage({ params, searchParams }: { params: { slug: string }, searchParams?: Search }) {
  const sp = searchParams || {};
  const { items, total, page, limit } = await fetchList(params.slug, sp);
  const base = await absUrl("/");
  const ld = itemListJsonLd({
   title: await listTitle(),
  description: await listDescription(),
    items: (Array.isArray(items) ? items : []).map((p: any) => ({
      url: new URL(`/blog/${p.slug}`, base).toString(),
      name: p.title,
      datePublished: p.published_at ?? undefined,
    })),
    inLanguage: "tr-TR",
  });
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <main className="mx-auto max-w-[clamp(320px,85vw,1100px)] p-4 md:p-6">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-4">Tag: {params.slug}</h1>

      {/* JSON-LD: ItemList */}
        <script type="application/ld+json" suppressHydrationWarning
    dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />

      {items.length === 0 && (
        <div className="text-sm text-gray-600 border rounded-2xl bg-white p-6">No posts found.</div>
      )}

      <ul className="grid gap-4">
        {items.map((p: any) => (
          <li key={p.id} className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-sm transition">
            <a href={`/blog/${p.slug}`} className="block">
              <div className="text-lg font-medium">{p.title}</div>
              <div className="text-xs text-gray-500 mt-1">
                {p.lang} • {new Date(p.updated_at).toLocaleDateString()}
                {Array.isArray(p.tags) && p.tags.length ? <> • {p.tags.slice(0,4).join(", ")}</> : null}
              </div>
              {p.summary && <p className="text-sm text-gray-700 mt-2 line-clamp-3">{p.summary}</p>}
            </a>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between mt-6">
          <PaginationLink disabled={page <= 1} href={`/blog/tag/${encodeURIComponent(params.slug)}?${buildQS(sp, { page: page - 1 })}`}>← Prev</PaginationLink>
          <div className="text-sm text-gray-600">Page {page} / {totalPages}</div>
          <PaginationLink disabled={page >= totalPages} href={`/blog/tag/${encodeURIComponent(params.slug)}?${buildQS(sp, { page: page + 1 })}`}>Next →</PaginationLink>
        </nav>
      )}
    </main>
  );
}

function buildQS(sp: Search, patch: Record<string, any>) {
  const u = new URL("http://x.local/blog");
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) { if (v[0] != null) u.searchParams.set(k, String(v[0])); }
    else if (v != null) u.searchParams.set(k, String(v));
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) u.searchParams.delete(k);
    else u.searchParams.set(k, String(v));
  }
  return u.searchParams.toString();
}

function PaginationLink({ href, disabled, children }: { href: string, disabled?: boolean, children: any }) {
  if (disabled) return <span className="text-gray-400 text-sm">{children}</span>;
  return <a href={href} className="text-blue-700 hover:underline text-sm">{children}</a>;
}
