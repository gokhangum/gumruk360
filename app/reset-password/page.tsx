'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useTranslations } from 'next-intl'
type Mode = 'request' | 'update'




function parseBoth(hashStr: string, queryStr: string) {
  const h = new URLSearchParams(hashStr.startsWith('#') ? hashStr.slice(1) : hashStr)
  const q = new URLSearchParams(queryStr.startsWith('?') ? queryStr.slice(1) : queryStr)
  const get = (k: string) => h.get(k) || q.get(k) || ''
  return {
    access_token: get('access_token'),
    refresh_token: get('refresh_token'),
    type: get('type'),
  }
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const t = useTranslations('auth.reset')
  const sp = useSearchParams()
  const supabase = createClientComponentClient()

 
  const [mode, setMode] = useState<Mode>('request')
  const [email, setEmail] = useState('')
  const [pwd1, setPwd1] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  
  useEffect(() => {
    
    ;(async () => {
      try {
        // 1) If hash/query contains recovery tokens, set session.
        const { access_token, refresh_token, type } = parseBoth(window.location.hash || '', window.location.search || '')
        if (type === 'recovery' && access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (error) throw error
          setMode('update')
          setMsg({ type: 'ok', text: t('setNew') })
          return
        }
        // 2) Else, if already authenticated (session exists), allow update directly.
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          setMode('update')
          setMsg({ type: 'ok', text: t('setNew') })
          return
        }
        // 3) Fallback to request mode
        setMode('request')
      } catch (e: any) {
        setMode('request')
        setMsg({ type: 'err', text: e?.message || t('unexpected') })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, supabase])

  async function sendLink() {
    setBusy(true); setMsg(null)
    try {
      // Prefer /api/auth/password/send; fall back to /api/auth/send if missing.
      let res = await fetch('/api/auth/password/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      if (res.status === 404) {
        res = await fetch('/api/auth/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      }
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || (data && data.ok === false)) {
        throw new Error((data && data.error) || 'failed')
      }
      setMsg({ type: 'ok', text: t('sent') })
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || t('failed') })
    } finally {
      setBusy(false)
    }
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (pwd1.length < 8) { setMsg({ type: 'err', text: t('errPwdLen') }); return }

if (pwd1 !== pwd2) { setMsg({ type: 'err', text: t('errPwdMatch') }); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd1 })
      if (error) throw error
      setMsg({ type: 'ok', text: t('okRedirect') })
      setTimeout(() => router.replace('/login'), 1200)
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || t('failed') })
    } finally {
      setBusy(false)
    }
  }



  if (mode === 'update') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <form onSubmit={updatePassword} className="w-full max-w-md border rounded-2xl p-6 space-y-4 bg-white">
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-gray-600">{t('setNew')}</p>
          <input className="w-full border rounded-lg p-3" type="password" placeholder={t('newPwd')} value={pwd1} onChange={e=>setPwd1(e.target.value)} />
          <input className="w-full border rounded-lg p-3" type="password" placeholder={t('newPwd2')} value={pwd2} onChange={e=>setPwd2(e.target.value)} />
          {msg && <div className={msg.type==='ok'?'text-green-700 text-sm':'text-red-600 text-sm'}>{msg.text}</div>}
          <button disabled={busy} className={`w-full py-2 rounded text-white ${busy ? 'bg-gray-400' : 'bg-black'}`}>{t('saveBtn')}</button>
        </form>
      </div>
    )
  }

  // request mode
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-2xl p-6 space-y-4 bg-white">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-gray-600">{t('sendHint')}</p>
        <input className="w-full border rounded-lg p-3" placeholder={t('emailPh')} type="email" value={email} onChange={e=>setEmail(e.target.value)} />
        {msg && <div className={msg.type==='ok'?'text-green-700 text-sm':'text-red-600 text-sm'}>{msg.text}</div>}
        <button disabled={busy || !email} onClick={sendLink} className={`w-full py-2 rounded text-white ${(busy || !email) ? 'bg-gray-400' : 'bg-black'}`}>{t('sendBtn')}</button>
      </div>
    </div>
  )
}
