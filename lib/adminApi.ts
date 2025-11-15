// lib/adminApi.ts
export const adminApi = {
  // Revizyon listesi
  listRevisions: (questionId: string) =>
    `/api/admin/questions/${encodeURIComponent(questionId)}/revisions`,

  // Tek revizyon içeriği
  getRevision: (questionId: string, revisionId: string) =>
    `/api/admin/questions/${encodeURIComponent(
      questionId
    )}/revisions/${encodeURIComponent(revisionId)}`,

  // Geçici: Taslağı revizyona çevir (kullanıyorsan)
  ingestDraft: (questionId: string) =>
    `/api/admin/questions/${encodeURIComponent(questionId)}/revisions/ingest`,

  // **Geri al (revert)** — 1 veya 2 argüman destekli
  // - adminApi.revert(questionId, revisionId)
  // - adminApi.revert(revisionId)  // eski kod uyumluluğu
  revert: (...args: string[]) => {
    if (args.length >= 2) {
      const [qid, rid] = args
      return `/api/admin/questions/${encodeURIComponent(
        qid
      )}/revisions/${encodeURIComponent(rid)}/revert`
    }
    const [rid] = args
    return `/api/admin/revisions/${encodeURIComponent(rid)}/revert`
  },
}
