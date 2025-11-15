"use client"

import { FormEvent, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

export default function AdminLoginPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const next = sp.get("next") || "/admin/requests"

  const [secret, setSecret] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ secret }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "invalid_secret")
      }
      router.replace(next)
    } catch (err: any) {
      setError(err?.message === "invalid_secret" ? "Geçersiz admin anahtarı" : "Giriş başarısız")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm border rounded-xl p-6 shadow-sm">
        <h1 className="text-lg font-semibold mb-1">Admin Girişi</h1>
        <p className="text-xs text-gray-600 mb-4">
          Yalnızca yetkili kullanıcılar. Giriş sonrası otomatik yönlendirme: <span className="font-mono">{next}</span>
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Admin Secret</label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="border rounded px-3 py-2"
              placeholder="••••••••"
              required
              autoFocus
            />
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl px-4 py-2 border shadow hover:shadow-md transition"
          >
            {loading ? "Giriş yapılıyor..." : "Giriş yap"}
          </button>
        </form>
        <p className="text-[10px] text-gray-500 mt-3">
          Not: Giriş httpOnly cookie ile yapılır. URL’de anahtar taşınmaz.
        </p>
      </div>
    </div>
  )
}
