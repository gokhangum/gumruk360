"use client"

import { useEffect, useState, FormEvent } from "react"
import { useRouter } from "next/navigation"
import { supabaseBrowser } from "@/lib/supabase/client"
import { useTranslations } from "next-intl";
export default function ResetPasswordConfirmPage() {
	
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState("")
  const [password2, setPassword2] = useState("")
  const [msg, setMsg] = useState<{type:"ok"|"error"; text:string} | null>(null)
const t = useTranslations("auth.reset");
  useEffect(() => {
    // Supabase, reset linkinden gelince hash'i okuyup "recovery" session kurar.
    // createBrowserClient detectSessionInUrl:true olduğu için yeterli.
    const init = async () => {
      try {
        const supabase = supabaseBrowser()
        // ufak gecikme
        await new Promise((r)=>setTimeout(r, 50))
        const { data: { session } } = await supabase.auth.getSession()
        setReady(!!session)
        if (!session) {
          setMsg({ type: "error", text: t("errors.invalidOrExpiredLink") })
        }
      } catch (e) {
        console.error(e)
        setMsg({ type: "error", text: t("errors.unexpected") })
      }
    }
    init()
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    try {
      if (password.length < 8) throw new Error(t("errors.passwordMin"));
      if (password !== password2) throw new Error(t("errors.passwordsMismatch"));
      const supabase = supabaseBrowser()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setMsg({ type: "ok", text: t("successUpdatedRedirect") })
      setTimeout(()=> router.replace("/login"), 1200)
    } catch (err: any) {
     
      setMsg({ type: "error", text: err?.message || t("errors.updateFailed") })
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 border rounded-xl p-6">
       <h1 className="text-xl font-semibold">{t("title")}</h1>

        {!ready && (
          <p className="text-sm text-gray-600">
            {msg?.text || t("verifying")}
          </p>
        )}

        {ready && (
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              type="password"
              required
              placeholder={t("placeholders.new")}
              value={password}
              onChange={(e)=>setPassword(e.target.value)}
              className="w-full border rounded-lg p-3"
            />
            <input
              type="password"
              required
              placeholder={t("placeholders.new2")}
              value={password2}
              onChange={(e)=>setPassword2(e.target.value)}
              className="w-full border rounded-lg p-3"
            />
            <button type="submit" className="w-full rounded-lg p-3 border bg-black text-white">
             {t("submit")}
            </button>
          </form>
        )}

        {msg && <p className={`text-sm ${msg.type==="error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>}
      </div>
    </div>
  )
}
