// lib/openai.ts
import OpenAI from "openai"

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  console.warn("[openai] OPENAI_API_KEY missing. Auto-evaluate will fail until set.")
}

export const openai = new OpenAI({ apiKey })
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini"
