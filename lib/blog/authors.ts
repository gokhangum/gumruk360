export type ProfileOption = {
  id: string;
  full_name: string | null;
  title: string | null;
  role: string;
};

export type AuthorOption = {
  id: string;
  name: string;
  title: string | null;
};

export type AuthorOptionsResponse = {
  profiles: ProfileOption[];
  authors: AuthorOption[];
};

export async function fetchAuthorOptions(): Promise<AuthorOptionsResponse> {
  const res = await fetch("/api/blog/author-options", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Author options fetch failed");
  }
  return res.json();
}

export async function createAuthor(payload: { name: string; title?: string | null; bio?: string | null; }) {
  const res = await fetch("/api/blog/authors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error || "Create author failed");
  }
  return res.json();
}
export async function uploadAuthorAvatar(params: { authorId: string; file: File }) {
  const fd = new FormData();
  fd.append("authorId", params.authorId);
  fd.append("file", params.file);

  const res = await fetch("/api/blog/authors/upload-avatar", {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error || "Avatar upload failed");
  }
  return res.json(); // { ok: true, path, publicUrl? }
}
