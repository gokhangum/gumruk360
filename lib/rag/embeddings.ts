// lib/rag/embeddings.ts
export const EMBED_MODEL = 'text-embedding-3-small' // 1536-dim

export async function embed(text: string): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('Missing OPENAI_API_KEY')
  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: key })
  const r = await openai.embeddings.create({ model: EMBED_MODEL, input: text })
  const v = r.data?.[0]?.embedding
  if (!Array.isArray(v)) throw new Error('Embedding failed')
  return v as number[]
}
