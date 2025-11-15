// lib/text-extract.ts
// Dinamik import + sağlam fallback: pdf-parse başarısızsa PDF bytes içinde "/Type /Page" say.

export type ExtractResult = {
  text: string
  pagesEst: number
  meta?: Record<string, any>
}

const MAX_CHARS_PER_FILE = 8000

function trimForModel(s: string, max = MAX_CHARS_PER_FILE) {
  const t = (s || "").replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return t.slice(0, max) + `\n…[truncated ${t.length - max} chars]`
}

function roughPagesByChars(len: number) {
  return Math.max(1, Math.round(len / 3000))
}

function countPdfPagesByMarker(buf: Buffer): number {
  try {
    const txt = buf.toString("latin1") // binary-safe
    const m = txt.match(/\/Type\s*\/Page\b/g)
    const n = m?.length ?? 0
    return Math.max(1, n)
  } catch {
    return 1
  }
}

export async function extractFromBuffer(
  buf: Buffer,
  contentType?: string,
  filename?: string
): Promise<ExtractResult> {
  const name = (filename || "").toLowerCase()
  const ct = (contentType || "").toLowerCase()

  // ---- PDF
  if (ct.includes("pdf") || name.endsWith(".pdf")) {
    // 1) pdf-parse dene
    try {
      const mod: any = await import("pdf-parse")
      const pdfParse = mod?.default || mod
      if (typeof pdfParse === "function") {
        const data = await pdfParse(buf)
        const text = trimForModel(data?.text || "")
        const pages =
          (data?.numpages && Number.isFinite(data.numpages))
            ? data.numpages
            : (text ? roughPagesByChars(text.length) : countPdfPagesByMarker(buf))
        return { text, pagesEst: pages, meta: { numpages: data?.numpages ?? null } }
      }
    } catch {
      // 2) Fallback: PDF imza sayımı
      const pages = countPdfPagesByMarker(buf)
      return { text: "[pdf text extract failed]", pagesEst: pages }
    }
    // En kötü ihtimal
    return { text: "[pdf text extract failed]", pagesEst: countPdfPagesByMarker(buf) }
  }

  // ---- DOCX
  if (ct.includes("word") || name.endsWith(".docx")) {
    try {
      const mod: any = await import("mammoth")
      const mammoth = mod?.default || mod
      if (mammoth?.extractRawText) {
        const { value } = await mammoth.extractRawText({ buffer: buf })
        const text = trimForModel(value || "")
        const words = (value || "").trim().split(/\s+/).filter(Boolean).length
        const pages = Math.max(1, Math.round((words || 0) / 500))
        return { text, pagesEst: pages, meta: { words } }
      }
    } catch { /* fall through */ }
    return { text: "[docx text extract failed]", pagesEst: 1 }
  }

  // ---- TXT/CSV/JSON
  if (ct.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".json")) {
    try {
      const text = trimForModel(Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf))
      return { text, pagesEst: roughPagesByChars(text.length) }
    } catch {
      return { text: "[text decode failed]", pagesEst: 1 }
    }
  }

  // ---- Diğer
  return {
    text: `[binary "${filename || "file"}" (${contentType || "unknown"}) — no text extracted]`,
    pagesEst: 1
  }
}
