'use client'


import { useMemo, useState, useEffect, useRef } from 'react'
import { useTranslations } from "next-intl";

export default function SignupPage() {
  const [type, setType] = useState<'individual'|'corporate'>('individual')
  const [fullName, setFullName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [signupOpen, setSignupOpen] = useState<boolean|null>(null)
   const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const turnstileSiteKey = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY || ''
  const captchaRef = useRef<HTMLDivElement | null>(null)
const t = useTranslations("auth.signup");

  const langParam = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const u = new URL(window.location.href)
    return u.searchParams.get('lang') || ''
  }, [])
  useEffect(() => {
    let canceled = false
    ;(async () => {
      try {
        const r = await fetch('/api/public/auth-flags', {
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        })
        const raw = await r.text().catch(() => '')
        let j: any = {}
        try { j = JSON.parse(raw || '{}') } catch {}
        const data = j.data ?? j
        if (!canceled) setSignupOpen(!!data?.signup_open)
      } catch {
        // Her ihtimale karşı kapatırsak signup'ı iptal eder; burada açık varsayıyoruz
        if (!canceled) setSignupOpen(true)
      }
    })()
    return () => { canceled = true }
  }, [])
    useEffect(() => {
    if (!turnstileSiteKey) return
    if (typeof window === 'undefined') return

    const render = () => {
      if (!captchaRef.current) return
      const w = window as any
      if (!w.turnstile) return
      w.turnstile.render(captchaRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => setCaptchaToken(token),
        'error-callback': () => setCaptchaToken(null),
        'expired-callback': () => setCaptchaToken(null),
      })
    }

    const existing = document.getElementById('cf-turnstile-script') as HTMLScriptElement | null

    if (existing) {
      const w = window as any
      if (w.turnstile) {
        render()
      } else {
        existing.addEventListener('load', render)
      }
      return
    }

    const s = document.createElement('script')
    s.id = 'cf-turnstile-script'
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.addEventListener('load', render)
    document.head.appendChild(s)

    return () => {
      s.removeEventListener('load', render)
    }
  }, [turnstileSiteKey])


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
if (signupOpen === false) { setError('Şuanda yeni kayıt alınamamaktadır'); return }
    if (!email || !password) {
      setError(t('errors.emailAndPasswordRequired'))

      return
    }
    if (password !== password2) {
      setError(t('errors.passwordsMismatch'))

      return
    }
    if (!fullName) {
      setError(t('errors.fullNameRequired'))

      return
    }
    if (type === 'corporate' && !orgName) {
      setError(t('errors.orgNameRequired'))

      return
    }

    setLoading(true)
    try {
      if (typeof window !== 'undefined') localStorage.setItem('g360_email', email)

      const apiUrl = '/api/auth/signup' + (langParam ? `?lang=${encodeURIComponent(langParam)}` : '')
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(langParam ? { 'x-lang': langParam } : {}),
		  ...(captchaToken ? { 'x-captcha-token': captchaToken } : {}),
        },
        body: JSON.stringify({
          email,
          password,
          fullName,
          orgName: type === 'corporate' ? orgName : null,
          accountType: type
        })
      })
      const json = await res.json()
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || t('errors.signupFailed'))

      }

      if (typeof window !== 'undefined') {
        const host = window.location.host.toLowerCase()
        const isLikelyEN =
            langParam === 'en' ||
            /(^|\.)tr\.easycustoms360\.com(?::\d+)?$/i.test(host) ||
            host === '127.0.0.1:3000'
        alert(t('success'))

        window.location.href = '/login?next=/dashboard'
      }
    } catch (e:any) {
      setError(e.message || t('errors.signupFailed'))

    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md border rounded-2xl p-6 space-y-4 bg-white">
        <h1 className="text-xl font-semibold">{t('title')}</h1>


        <div className="flex gap-3 items-center">
          <label className="flex items-center gap-2">
            <input type="radio" name="acc" checked={type==='individual'} onChange={()=>setType('individual')} required />
           <span>{t('individual')}</span>

          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="acc" checked={type==='corporate'} onChange={()=>setType('corporate')} required />
           <span>{t('corporate')}</span>

          </label>
        </div>

      <input className="w-full border rounded-lg p-3"
  placeholder={t('fullName')}
  value={fullName}
  onChange={e=>setFullName(e.target.value)} />


        <input className="w-full border rounded-lg p-3" type="email"
  placeholder={t('email')}
  value={email}
  onChange={e=>{ setEmail(e.target.value); if (typeof window!=='undefined') localStorage.setItem('g360_email', e.target.value); }} />


        <div className="grid grid-cols-2 gap-2">
          <input className="w-full border rounded-lg p-3" type="password"
  placeholder={t('password')}
  value={password}
  onChange={e=>setPassword(e.target.value)} />

          <input className="w-full border rounded-lg p-3" type="password"
  placeholder={t('password2')}
  value={password2}
  onChange={e=>setPassword2(e.target.value)} />

        </div>

        {type === 'corporate' && (
         <input className="w-full border rounded-lg p-3"
  placeholder={t('orgName')}
  value={orgName}
  onChange={e=>setOrgName(e.target.value)} />

        )}
 <div ref={captchaRef} className="mt-2" />
        {error && <div className="text-sm text-red-600">{error}</div>}

         <button disabled={loading || signupOpen === false} className={"w-full py-2 rounded text-white " + ((loading || signupOpen === false) ? 'bg-gray-400' : 'bg-black')}>
          {loading
           ? t('creatingAccount')
            : (signupOpen === false ? 'Şuanda yeni kayıt alınamamaktadır' : t('signUp'))}

        </button>
      </form>
    </div>
  )
}
