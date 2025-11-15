export function resolvePublicUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;        // Zaten tam URL

  // Örn: "blog/...", "authors/...", "workers-cv/..." ya da sadece "uuid/file.jpg"
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") || "";
  const clean = String(path).replace(/^\/+/, "");
  const [first, ...rest] = clean.split("/");
  const known = new Set(["blog", "authors", "workers-cv", "news"]);
  const bucket = known.has(first) ? first : "blog";
  const key = known.has(first) ? rest.join("/") : clean;
  const urlPath = `/storage/v1/object/public/${bucket}/${key}`;
  return base ? `${base}${urlPath}` : urlPath;
}
