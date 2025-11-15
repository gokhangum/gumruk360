// lib/rag/chunk.ts
export function chunkText(input: string, maxChars = 1200): string[] {
  const text = (input || '').replace(/\r/g, '')
  const paras = text.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean)
  const out: string[] = []
  let buf = ''

  const push = () => { if (buf.trim()) { out.push(buf.trim()); buf = '' } }

  for (const p of paras) {
    if ((buf + '\n\n' + p).length <= maxChars) {
      buf = buf ? `${buf}\n\n${p}` : p
    } else {
      push()
      if (p.length <= maxChars) out.push(p)
      else {
        // çok uzun parayı cümle bazlı böl
        let cur = ''
        for (const s of p.split(/(?<=[\.!\?])\s+/)) {
          if ((cur + ' ' + s).length <= maxChars) cur = cur ? `${cur} ${s}` : s
          else { if (cur) out.push(cur); cur = s }
        }
        if (cur) out.push(cur)
      }
    }
  }
  push()
  return out
}
