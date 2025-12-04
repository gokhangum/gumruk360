"use client"

import { useEffect, useMemo, useState } from "react"

type Worker = { id: string; email: string }

type PermRow = {
  worker_id: string
  email: string | null
  override: "inherit" | "allow" | "deny"
  effective_enabled: boolean
}

export default function AdminSettingsPage() {
  // --- mevcut alanlar (rol atama) ---
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [workers, setWorkers] = useState<Worker[]>([])

  // --- global mesaj bayrağı ---
  const [flagBusy, setFlagBusy] = useState(false)
  const [workerMessagingEnabled, setWorkerMessagingEnabled] = useState<boolean | null>(null)
   const [draftGenerateEnabled, setDraftGenerateEnabled] = useState<boolean | null>(null)
   const [draftFlagBusy, setDraftFlagBusy] = useState(false)
   const [draftPerms, setDraftPerms] = useState<PermRow[]>([])
  // --- AUTH: Login/Signup open/close ---
  const [loginOpen, setLoginOpen] = useState<boolean | null>(null)
  const [signupOpen, setSignupOpen] = useState<boolean | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
const [currentHost, setCurrentHost] = useState<string | null>(null)
  const [flagError, setFlagError] = useState<string | null>(null)

  // --- kişi bazlı izinler ---
  const [permBusyMap, setPermBusyMap] = useState<Record<string, boolean>>({})
  const [permRows, setPermRows] = useState<PermRow[]>([])
  const permMap = useMemo(() => {
    const m: Record<string, PermRow> = {}
    for (const r of permRows) m[r.worker_id] = r
    return m
  }, [permRows])

  // -------------------- Loaders --------------------
  async function loadWorkers() {
    try {
      const res = await fetch("/api/admin/users/set-role", { cache: "no-store" })
      const json = await res.json()
      if (json?.ok) setWorkers(json.data || [])
      else setWorkers([])
    } catch {
      setWorkers([])
    }
  }

  async function loadMessageFlag() {
    try {
      setFlagError(null)
      const r = await fetch("/api/admin/settings/message-sending", { cache: "no-store" })
      const ct = r.headers.get("content-type") || ""
      if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "")
        
        throw new Error("Ayar endpoint’i JSON yerine farklı bir içerik döndü.")
      }
      const j = await r.json()
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Ayar okunamadı")
      setWorkerMessagingEnabled(!!j.data?.workerMessagingEnabled)
       // --- DRAFT GENERATE (global)
      const r2 = await fetch("/api/admin/settings/draft-generate", { cache: "no-store" })
       const txt2 = await r2.text().catch(() => "")
       let j2: any = {}
       try { j2 = JSON.parse(txt2 || "{}") } catch { }
      setDraftGenerateEnabled(!!j2.data?.draftGenerateEnabled)

      // --- DRAFT GENERATE (worker overrides)
       const r3 = await fetch("/api/admin/settings/worker-draft-permissions", { cache: "no-store" })
       const j3 = await r3.json().catch(() => ({}))
      if (Array.isArray(j3.data)) setDraftPerms(j3.data as PermRow[])

    } catch (e: any) {
      setFlagError(e?.message || "Ayar okunamadı")
      setWorkerMessagingEnabled(true) // güvenli varsayılan
    }
  }

  async function loadWorkerPerms() {
    try {
      const r = await fetch("/api/admin/settings/worker-message-permission", { cache: "no-store" })
      const j = await r.json()
      if (!r.ok || !j?.ok) throw new Error(j?.error || "İzin listesi okunamadı")
      setPermRows(Array.isArray(j.data) ? j.data : [])
    } catch (e) {
      
      setPermRows([])
    }
  }
  async function loadAuthFlags() {
    try {
      setAuthError(null)
      const r = await fetch("/api/admin/settings/auth-flags", { cache: "no-store" })
      const ct = r.headers.get("content-type") || ""
      if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "")
        
        throw new Error("Auth bayrakları JSON dönmedi.")
      }
      const j = await r.json()
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Auth bayrakları okunamadı")
      setLoginOpen(!!j.data?.login_open)
      setSignupOpen(!!j.data?.signup_open)
    } catch (e: any) {
      setAuthError(e?.message || "Auth bayrakları okunamadı")
      setLoginOpen(true)
      setSignupOpen(true)
    }
  }
 useEffect(() => {
   if (typeof window !== "undefined") {
     setCurrentHost(window.location.host || null)
    }
  }, [])
  useEffect(() => {
    loadWorkers()
    loadMessageFlag()
	loadAuthFlags()
    loadWorkerPerms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -------------------- Actions --------------------
  async function toggleMessageFlag() {
    if (workerMessagingEnabled == null) return
    setFlagBusy(true)
    setFlagError(null)
    try {
      const next = !workerMessagingEnabled
      const r = await fetch("/api/admin/settings/message-sending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      })
      const ct = r.headers.get("content-type") || ""
      if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "")
        
        throw new Error("Güncelleme beklenmeyen yanıt döndü.")
      }
      const j = await r.json()
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Güncelleme başarısız")
      setWorkerMessagingEnabled(!!j.data?.workerMessagingEnabled)
      } catch (e: any) {
      setFlagError(e?.message || "Güncelleme başarısız")
    } finally {
      setFlagBusy(false)
    }
  }
  async function toggleDraftGenerate() {
    if (draftGenerateEnabled == null) return
     setDraftFlagBusy(true)
     try {
       const next = !draftGenerateEnabled
       const r = await fetch("/api/admin/settings/draft-generate", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
       })
       const txt = await r.text().catch(() => "")
       let j: any = {}
       try { j = JSON.parse(txt || "{}") } catch { }
       setDraftGenerateEnabled(!!j.data?.draftGenerateEnabled)
     } finally {
       setDraftFlagBusy(false)
     }
   }
  async function toggleAuth(kind: "login" | "signup") {
    if (loginOpen == null || signupOpen == null) return
    setAuthBusy(true)
    setAuthError(null)
    try {
      const nextLogin  = kind === "login"  ? !loginOpen  : loginOpen
      const nextSignup = kind === "signup" ? !signupOpen : signupOpen
      const r = await fetch("/api/admin/settings/auth-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login_open: nextLogin, signup_open: nextSignup }),
      })
      const ct = r.headers.get("content-type") || ""
      if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "")
        
        throw new Error("Güncelleme beklenmeyen yanıt döndü.")
      }
      const j = await r.json()
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Güncelleme başarısız")
      setLoginOpen(!!j.data?.login_open)
      setSignupOpen(!!j.data?.signup_open)
    } catch (e: any) {
      setAuthError(e?.message || "Güncelleme başarısız")
    } finally {
      setAuthBusy(false)
    }
  }

  async function setRole(nextRole: "worker" | "user", target?: { email?: string; id?: string }) {
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const body: any = { role: nextRole }
      if (target?.id) body.id = target.id
      if (target?.email) body.email = target.email
      if (!body.id && !body.email && nextRole === "worker") {
        body.email = email.trim()
      }

      const res = await fetch("/api/admin/users/set-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json?.ok) throw new Error(json?.error || "request_failed")

      if (nextRole === "worker") {
        setOk(
          json.mode === "updated_profile_by_id"
            ? "Worker yetkisi atandı (kayıtlı kullanıcı güncellendi)."
            : "Worker yetkisi atandı (allowlist'e alındı; kayıt olunca worker olacak)."
        )
      } else {
        setOk("Worker yetkisi kaldırıldı (user yapıldı).")
      }

      setEmail("")
      await loadWorkers()
      await loadWorkerPerms()
    } catch (e: any) {
      setError(e?.message || "İşlem başarısız")
    } finally {
      setBusy(false)
    }
  }

  async function updateWorkerPermission(workerId: string, permission: "inherit" | "allow" | "deny") {
    setPermBusyMap((m) => ({ ...m, [workerId]: true }))
    try {
      const r = await fetch("/api/admin/settings/worker-message-permission", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId, permission }),
      })
      const j = await r.json()
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Güncelleme başarısız")

      // tek satırı güncelle
      setPermRows((rows) => {
        const idx = rows.findIndex((x) => x.worker_id === workerId)
        if (idx === -1) return rows.concat(j.data)
        const clone = rows.slice()
        clone[idx] = j.data
        return clone
      })
    } catch (e) {
      alert((e as any)?.message || "Güncelleme başarısız")
    } finally {
      setPermBusyMap((m) => ({ ...m, [workerId]: false }))
    }
  }

  // -------------------- UI helpers --------------------
  function Dot({ on }: { on: boolean }) {
    return (
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${on ? "bg-green-500" : "bg-red-500"}`}
        title={on ? "Etkin" : "Kapalı"}
      />
     )
   }
   async function updateWorkerDraftPermission(workerId: string, override: "inherit" | "allow" | "deny") {
    try {
       await fetch("/api/admin/settings/worker-draft-permissions", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: workerId, override }),
       })
       const r = await fetch("/api/admin/settings/worker-draft-permissions", { cache: "no-store" })
       const j = await r.json().catch(() => ({}))
       if (Array.isArray(j.data)) setDraftPerms(j.data as PermRow[])
    } catch (e) {
       
     }
   }

  function renderPermCell(w: Worker) {
    const row = permMap[w.id]
    const override = row?.override ?? "inherit"
    const effective =
      row?.effective_enabled ??
      // perm yoksa effective global kabul (inherit davranışı)
      !!workerMessagingEnabled

    const disabled = !!permBusyMap[w.id]

    return (
      <div className="flex items-center gap-2">
        <select
          className="border px-2 py-1 rounded"
          value={override}
          disabled={disabled}
          onChange={(e) =>
            updateWorkerPermission(
              w.id,
              e.target.value as "inherit" | "allow" | "deny"
            )
          }
        >
          <option value="inherit">
            Varsayılan (Global: {workerMessagingEnabled ? "Açık" : "Kapalı"})
          </option>
          <option value="allow">Açık</option>
          <option value="deny">Kapalı</option>
        </select>
        <Dot on={effective} />
      </div>
    )
  }

  // -------------------- Render --------------------
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-2">Ayarlar</h1>

      {/* Global Mesaj İzni */}
      <div className="mb-6 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Worker Mesajlaşma</div>
            <div className="text-sm text-gray-600">
              Global anahtar (kill switch). Kişi bazlı izinler <em>override</em> edebilir.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm">
              Durum:{" "}
              <strong>
                {workerMessagingEnabled == null
                  ? "Yükleniyor…"
                  : workerMessagingEnabled
                  ? "Açık"
                  : "Kapalı"}
              </strong>
            </span>
            <button
              onClick={toggleMessageFlag}
              disabled={flagBusy || workerMessagingEnabled == null}
              className="px-3 py-1 rounded border"
            >
              {flagBusy ? "Güncelleniyor…" : "Aç/Kapat"}
            </button>
          </div>
        </div>
        {flagError && <div className="mt-2 text-sm text-red-600">{flagError}</div>}
      </div>
      {/* Taslak Üret (Global) */}
       <div className="mb-6 rounded-lg border p-4">
        <div className="flex items-center justify-between">
           <div>
             <div className="font-medium">Taslak Üret Butonu</div>
             <div className="text-sm text-gray-600">Hızlı taslak üretme özelliğini global olarak aç/kapat.</div>
           </div>
          <div className="flex items-center gap-3">
  <span className="text-sm">
    Durum:{" "}
    <strong>
      {draftGenerateEnabled == null
        ? "Yükleniyor…"
        : (draftGenerateEnabled ? "Açık" : "Kapalı")}
    </strong>
  </span>
  <button
    className="px-3 py-1 rounded border"
    onClick={toggleDraftGenerate}
    disabled={draftFlagBusy || draftGenerateEnabled == null}
  >
    {draftFlagBusy ? "Güncelleniyor…" : (draftGenerateEnabled ? "Kapat" : "Aç")}
  </button>
</div>

         </div>
       </div>
    {/* Login / Signup Erişimi */}
     <div className="mb-6 rounded-lg border p-4">
   <div className="flex items-center justify-between">
         <div>
           <div className="font-medium">Login / Signup Erişimi</div>
          <div className="text-sm text-gray-600">
           <div>
            Bu ayar, içinde bulunduğunuz domain için geçerlidir
            (örn. gumruk360.com / tr.easycustoms360.com).
           </div>
            <div>
               Giriş ve kayıt ol akışlarını bu domain için açıp kapatabilirsiniz.
               {currentHost && (
                 <span className="ml-1 text-xs text-gray-500">
                  (Şu an: {currentHost})
                 </span>
               )}
         </div>
          </div>
         </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm">
                Login:{" "}
                <strong>
                  {loginOpen == null ? "Yükleniyor…" : (loginOpen ? "Açık" : "Kapalı")}
                </strong>
              </span>
              <button
                onClick={() => toggleAuth("login")}
                disabled={authBusy || loginOpen == null || signupOpen == null}
                className="px-3 py-1 rounded border"
              >
                {authBusy ? "Güncelleniyor…" : (loginOpen ? "Kapat" : "Aç")}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">
                Signup:{" "}
                <strong>
                  {signupOpen == null ? "Yükleniyor…" : (signupOpen ? "Açık" : "Kapalı")}
                </strong>
              </span>
              <button
                onClick={() => toggleAuth("signup")}
                disabled={authBusy || loginOpen == null || signupOpen == null}
                className="px-3 py-1 rounded border"
              >
                {authBusy ? "Güncelleniyor…" : (signupOpen ? "Kapat" : "Aç")}
              </button>
            </div>
          </div>
        </div>
        {authError && <div className="mt-2 text-sm text-red-600">{authError}</div>}
      </div>

      {/* Worker Rol Atama */}
      <div className="mb-6 rounded-lg border p-4">
        <div className="font-medium mb-2">Worker Rol Yönetimi</div>
        <div className="flex gap-2 mb-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kullanici@example.com"
            className="border rounded px-2 py-1 flex-1"
          />
          <button
            onClick={() => setRole("worker")}
            disabled={busy || !email.trim()}
            className="px-3 py-1 rounded border"
          >
            Worker yap
          </button>
        </div>
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        {ok && <div className="text-sm text-green-600 mb-2">{ok}</div>}

        {/* Worker listesi */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="p-2">E-posta</th>
                <th className="p-2">İşlemler</th>
                <th className="p-2">Mesaj İzni</th>
				<th className="p-2">Taslak Üret</th>
              </tr>
            </thead>
            <tbody>
              {workers.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-2 text-gray-500">
                    Kayıtlı worker bulunamadı.
                  </td>
                </tr>
              )}
              {workers.map((w) => (
                <tr key={w.id} className="border-b">
                  <td className="p-2">{w.email || "(email yok)"}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setRole(
                            "user",
                            w.email && w.email !== "(email yok)" ? { email: w.email } : { id: w.id }
                          )
                        }
                        disabled={busy}
                        className="px-3 py-1 rounded border"
                      >
                        Yetki kaldır (user yap)
                      </button>
                      <span className="text-xs text-gray-500">ID: {w.id.slice(0, 8)}…</span>
                    </div>
                  </td>
                  <td className="p-2">{renderPermCell(w)}</td>
				                   <td className="p-2">
                    {(() => {
                       const row = draftPerms.find(p => p.worker_id === w.id)
                       const effective = row ? row.effective_enabled : !!draftGenerateEnabled
                       const override = row?.override ?? "inherit"
                      return (
                        <div className="flex items-center gap-2">
                         <select
                             className="border rounded px-2 py-1 text-sm"
                             value={override}
                           onChange={(e) => updateWorkerDraftPermission(w.id, e.target.value as any)}
                         >
                            <option value="inherit">Varsayılan (Global: {draftGenerateEnabled ? "Açık" : "Kapalı"})</option>
                           <option value="allow">Açık</option>
                            <option value="deny">Kapalı</option>
                           </select>
                           <span className={`inline-block w-2 h-2 rounded-full ${effective ? "bg-green-500" : "bg-gray-400"}`} />
                        </div>
                       )
                    })()}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
