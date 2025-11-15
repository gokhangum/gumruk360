export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import type { EmailOtpType } from "@supabase/supabase-js"



export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const search = url.searchParams

  const token_hash = search.get("token_hash") || search.get("token") || search.get("code") || search.get("code") || search.get("code")
  const type = (search.get("type") as EmailOtpType) || "magiclink"
  
const nextPath = search.get("next") || "/profile"
  // Fallback: no token & no email param — check current session and fire welcome if confirmed
  if (!token_hash && !search.get("e")) {
    const response = NextResponse.redirect(new URL(nextPath, url.origin))

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const supabase = createServerClient(supabaseUrl, supabaseAnon, {
        cookies: {
          get: (name: string) => request.cookies.get(name)?.value,
          set: (name: string, value: string, options: any) => {
            response.cookies.set({ name, value, ...options })
          },
          remove: (name: string, options: any) => {
            response.cookies.set({ name, value: "", ...options })
          },
        },
      })

      const { data: userData } = await supabase.auth.getUser()
      const u: any = userData?.user || null
      const email = u?.email || null
      const fullName = u?.user_metadata?.full_name || null
      const confirmed = !!u?.email_confirmed_at

      if (email && confirmed) {
        const lang = search.get("lang") || undefined
        const target = new URL("/api/auth/welcome/send" + (lang ? `?lang=${encodeURIComponent(lang)}` : ""), url.origin)
        try {
          const resp = await Promise.race([
            fetch(target.toString(), {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(lang ? { "x-lang": lang } : {}) },
              body: JSON.stringify({ email, fullName }),
              cache: "no-store",
            }),
            new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("welcome_timeout")), 1200)) as any,
          ])
          if (!resp.ok) {
            const txt = await resp.text().catch(() => "")
            
          }
        } catch (err:any) {
          
        }
      } else {
        
      }
    } catch (e:any) {
      
    }
    return response
  }


  // Fallback: no token case — use ?e=email to trigger welcome and continue
  if (!token_hash) {
    const emailParam = search.get("e")
    const nextPath = search.get("next") || "/profile"
    const response = NextResponse.redirect(new URL(nextPath, url.origin))
    if (emailParam) {
      try {
        const lang = search.get("lang") || undefined
        const target = new URL("/api/auth/welcome/send" + (lang ? `?lang=${encodeURIComponent(lang)}` : ""), url.origin)
        const resp = await Promise.race([
          fetch(target.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(lang ? { "x-lang": lang } : {}) },
            body: JSON.stringify({ email: emailParam, fullName: null }),
            cache: "no-store",
          }),
          new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("welcome_timeout")), 1200)) as any,
        ])
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "")
          
        }
      } catch (err:any) {
       
      }
    }
    return response
  }


  if (!token_hash) {
    return NextResponse.json({ ok:false, error:"missing_token" }, { status: 400 })
  }

  const response = NextResponse.redirect(new URL(nextPath, url.origin))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      get: (name: string) => request.cookies.get(name)?.value,
      set: (name: string, value: string, options: any) => {
        response.cookies.set({ name, value, ...options })
      },
      remove: (name: string, options: any) => {
        response.cookies.set({ name, value: "", ...options })
      },
    },
  })

  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })
  if (error) {
    return NextResponse.json({ ok:false, error:"verify_failed", detail: error.message }, { status: 400 })
  }

  try {
    const email = data?.user?.email || (await supabase.auth.getUser()).data?.user?.email || ""
    const fullName = (data?.user?.user_metadata as any)?.full_name
      ?? ((await supabase.auth.getUser()).data?.user?.user_metadata as any)?.full_name
      ?? null
    if (email) {
      const lang = search.get("lang")
      const target = new URL("/api/auth/welcome/send" + (lang ? `?lang=${encodeURIComponent(lang)}` : ""), url.origin)

      async function withTimeout(p: Promise<Response>, ms: number): Promise<Response> {
        return await Promise.race([
          p,
          new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("welcome_timeout")), ms)) as any,
        ])
      }
      try {
        const resp = await withTimeout(fetch(target.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(lang ? { "x-lang": lang } : {}) },
          body: JSON.stringify({ email, fullName }),
          cache: "no-store",
        }), 1200)
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "")
          
        }
      } catch (err:any) {
        
      }
    }
  } catch (_) {}

  return response
}
