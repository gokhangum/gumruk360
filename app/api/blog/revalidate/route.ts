import { revalidateTag } from 'next/cache';

export async function POST() {
  try {
    revalidateTag('blog');    // listeler & tag sayfaları sizin stratejinizle invalidate
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
