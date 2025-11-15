import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
// import type { Database } from '@/lib/supabase/types'
type Db = any

export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

  return createServerClient<Db>(url, anon, {
    cookies: {
      get: async (name: string) => {
        const c = await cookies()
        return c.get(name)?.value
      },
      set: async (name: string, value: string, options?: CookieOptions) => {
        const c = await cookies()
        c.set(name, value, options as any)
      },
      remove: async (name: string, options?: CookieOptions) => {
        const c = await cookies()
        c.set(name, '', { ...options, maxAge: 0 })
      }
    }
  })
}
