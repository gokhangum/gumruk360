'use client'

import { useEffect, useState, useMemo } from "react"
import { supabaseBrowser } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import BillingSection from "./BillingSection"
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
function onlyDigits(s: string){ return s.replace(/\D+/g, ""); }
function getDialCode(country?: string){
  const c = (country||"").toLowerCase();
  if (c.includes("türk") || c==="tr" || c==="turkiye") return "+90";
  if (c.includes("almanya") || c==="de" || c==="germany") return "+49";
  if (c.includes("birleşik krallık") || c==="uk" || c==="united kingdom" || c==="gb") return "+44";
  if (c==="abd" || c==="usa" || c==="united states") return "+1";
  if (c.includes("fransa") || c==="fr") return "+33";
  if (c.includes("italya") || c==="it") return "+39";
  return "+";
}

type UserMeta = {
  full_name?: string
  phone?: string
  birth_date?: string // YYYY-MM-DD
  phone_dial_code?: string
}

// NOTE: Client components cannot be async. Move async work into effects/handlers.
export default function DashboardProfilePage() {
	const t = useTranslations("profile");
  const router = useRouter()
  const sb = supabaseBrowser()

  const [email, setEmail] = useState<string>("")
  const [meta, setMeta] = useState<UserMeta>({ full_name: "", phone: "", birth_date: "", phone_dial_code: "+90" })
  const [loading, setLoading] = useState<boolean>(true)
  const [touchedPhoneMeta, setTouchedPhoneMeta] = useState(false)
  const phoneError = useMemo(()=>{
    const p = meta.phone || ""
    if (!p) return ""
    return onlyDigits(p).length === 10 ? "" : "invalid_phone_10"
  }, [meta.phone])

  // Password form
  const [curPass, setCurPass] = useState("")
  const [newPass, setNewPass] = useState("")
  const [newPass2, setNewPass2] = useState("")
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [pwdMsg, setPwdMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null)

  useEffect(() => {
    let mounted = TrueFlag()
    ;(async () => {
      try {
        const { data, error } = await sb.auth.getUser()
        if (error) throw error
        const u = data.user
        if (!mounted.value) return
        if (!u) {
          router.replace("/login?next=/dashboard/profile")
          return
        }
        setEmail(u.email || "")
        const md = (u.user_metadata || {}) as UserMeta
        setMeta({ full_name: md.full_name || "", phone: md.phone || "", birth_date: md.birth_date || "", phone_dial_code: md.phone_dial_code || "+90" })
      } catch (e) {
      
        setMsg({ type: "error", text: t("errors.loadFailed") })
      } finally {
        if (mounted.value) setLoading(false)
      }
    })()
    return () => { mounted.value = false }
  }, [sb, router])

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (onlyDigits(meta.phone || "").length !== 10) {
      setTouchedPhoneMeta(true)
      setMsg({ type: "error", text: "invalid_phone_10" })
      return
    }
    const { error } = await sb.auth.updateUser({ data: { full_name: (meta.full_name || "").trim() || undefined, phone: (meta.phone || "").trim() || undefined, birth_date: (meta.birth_date || "").trim() || undefined, phone_dial_code: (meta.phone_dial_code || "+90") } as UserMeta, })
    if (error) {
      setMsg({ type: "error", text: error.message || t("errors.saveFailed") })
    } else {
      setMsg({ type: "ok", text: t("saved") })
    }
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwdMsg(null)
   if ((newPass || "").length < 8) {
     setPwdMsg({ type: "error", text: t("errors.minLength") })
      return
    }
    if (newPass !== newPass2) {
     setPwdMsg({ type: "error", text: t("errors.passwordsMismatch") })
      return
    }
    // Re-auth with current password
    const { data: udata } = await sb.auth.getUser()
    const em = udata.user?.email || ""
    const signin = await sb.auth.signInWithPassword({ email: em, password: curPass })
    if (signin.error) {
      setPwdMsg({ type: "error", text: t("errors.invalidCurrentPassword") })
      return
    }
    const upd = await sb.auth.updateUser({ password: newPass })
    if (upd.error) {
      setPwdMsg({ type: "error", text: upd.error?.message || t("errors.unknown") })
    } else {
      setPwdMsg({ type: "ok", text: t("updated") })
      setCurPass("")
      setNewPass("")
      setNewPass2("")
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">{t("loading")}</div>
  }


    return (

	
      <div className="px-3 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 max-w-[928px]">
	
			 
        <Card className="shadow-colored">

          <CardHeader>
		  
            
<div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 mb-1 flex items-center gap-3">
             <h2 className="text-xl font-semibold">{t("accountInfo")}</h2> </div>
          
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Üyelik Bilgileri */}

      <form onSubmit={onSaveProfile} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="space-y-1">
            <div className="text-sm text-gray-600">{t("name")}</div>
             <Input
              type="text"
              value={meta.full_name || ""}
              onChange={(e) => setMeta((m) => ({ ...m, full_name: e.target.value }))}
              placeholder={t("name")}
              required
            />
          </label>
          <label className="space-y-1">
           <div className="text-sm text-gray-600">{t("birthDate")}</div>
               <Input
              type="date"
              value={meta.birth_date || ""}
              onChange={(e) => setMeta((m) => ({ ...m, birth_date: e.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-gray-600">{t("phone")}</div>
            <div className="flex">
              <select
  className="input w-28 rounded-none rounded-l bg-gray-50 text-gray-700"
  value={meta.phone_dial_code || "+90"}
  onChange={(e)=> setMeta(m=>({ ...m, phone_dial_code: e.target.value }))}
>
                <option value="+90">+90 (TR)</option>
                <option value="+49">+49 (DE)</option>
                <option value="+44">+44 (UK)</option>
                <option value="+1">+1 (US)</option>
                <option value="+33">+33 (FR)</option>
                <option value="+39">+39 (IT)</option>
                <option value="+">{t("otherDial")}</option>
              </select>
                <Input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                className="rounded-none rounded-r"
                value={meta.phone || ""}
                onChange={(e)=> setMeta((m)=>({ ...m, phone: onlyDigits(e.target.value).slice(0,10) }))}
                onBlur={()=> setTouchedPhoneMeta(true)}
              />
            </div>
            {(touchedPhoneMeta && phoneError) ? (<p className="text-xs text-red-600 mt-1">{t("errors.phoneTenDigits")}</p>) : null}
          </label>
          <label className="space-y-1">
            <div className="text-sm text-gray-600">{t("email")}</div>
          <Input
              type="email"
              className="bg-gray-50"
              value={email}
              readOnly
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="px-4 py-2 rounded bg-emerald-600 text-white"
          >
            {t("save")}
          </button>
          {msg && (
            <span className={msg.type === "ok" ? "text-green-700 text-sm" : "text-red-600 text-sm"}>
              {msg.text}
            </span>
          )}
        </div>
      </form>

      {/* Şifre Değişikliği */}
      <form onSubmit={onChangePassword} className="space-y-4">
        <div className="text-lg font-medium">{t("changePassword")}</div>
        <div className="grid sm:grid-cols-3 gap-4">
          <label className="space-y-1">
            <div className="text-sm text-gray-600">{t("currentPassword")}</div>
            <input
              type="password"
              className="w-full border rounded p-2"
              value={curPass}
              onChange={(e) => setCurPass(e.target.value)}
              placeholder={t("currentPassword")}
              required
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-gray-600">{t("newPassword")}</div>
            <input
              type="password"
              className="w-full border rounded p-2"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder={t("passwordMinHint")}
              required
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-gray-600">{t("newPassword2")}</div>
            <input
              type="password"
              className="w-full border rounded p-2"
              value={newPass2}
              onChange={(e) => setNewPass2(e.target.value)}
              placeholder={t("newPassword2")}
              required
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
<Button type="submit" variant="primary">
            {t("updatePassword")}
          </Button>
          {pwdMsg && (
            <span className={pwdMsg.type === "ok" ? "text-green-700 text-sm" : "text-red-600 text-sm"}>
              {pwdMsg.text}
            </span>
          )}
        </div>
      </form>
      
   {/* Fatura Bilgileri */}
            <BillingSection />
          </CardContent>
        </Card>
      </div>
   
  )
}
/**
 * Small helper to hold a mutable boolean in closures
 */
function TrueFlag() {
  return { value: true }
}
