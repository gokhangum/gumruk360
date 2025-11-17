
"use client"

import React, { useEffect, useRef, useState } from "react"
import CvHoverPreview from "@/components/cv/CvHoverPreview"
import CvPreviewById from "@/components/cv/CvPreviewById"
import { useRouter } from "next/navigation"
import BusyOverlay from "@/components/ui/BusyOverlay"
import Level2Modal from "@/components/precheck/Level2Modal"
import { useTranslations, useLocale } from "next-intl"
import AskAiNoticeModal from "@/components/AskAiNoticeModal"
import Modal from "@/components/ui/Modal"
// --- Types ---
type Pricing = {
  estHours: number
  estDaysNormal: number
  estDaysUrgent: number
  baseHourly: number
  minFee: number
  priceRaw: number
  priceFinal: number
  firstTimeMultiplier?: number
  urgentMultiplier: number
  slaDueAt: string
  calcMode?: string
}

type ApiResp = {
  ok: boolean
  question?: { id?: string }
  pricing?: Pricing
  auto?: {
    mode?: "gpt" | "heuristic"
    total_score: number
    pages_from_files: number
    pages_extra: number
    pages_total: number
    uploads: any[]
    reasoning_short?: string
  }
  error?: string
  detail?: string
  code?: string
}

type Worker = {
  id: string
  name: string
  email?: string
}

// --- Helpers ---
function resolveQuestionId(json: ApiResp | null): string | null {
  if (!json) return null
  return (
    json.question?.id ||
    (json as any).id ||
    (json as any).data?.id ||
    (json as any).questionId ||
    null
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—"
  const units = ["B", "KB", "MB", "GB"]
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export default function AskPage() {
  const router = useRouter()
  const [precheckBusy, setPrecheckBusy] = useState(false)

  const [showL2, setShowL2] = useState(false);
  const [l2Data, setL2Data] = useState<any>(null);
  const t = useTranslations("ask.page")
const locale = useLocale()
const nf2 = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const [lastQuestionId, setLastQuestionId] = useState<string | null>(null);

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isUrgent, setIsUrgent] = useState(false)
  const [pages, setPages] = useState<number>(0) // UI'dan kaldırıldı; API'ye varsayılan 0 gönderiyoruz
  const [files, setFiles] = useState<File[]>([])
// Açıklama yardımı popup kontrol ve odak
  const [showDescHelp, setShowDescHelp] = useState(false)
  const descRef = useRef<HTMLTextAreaElement | null>(null)
  const descHelpShownRef = useRef(false) // ilk tıklamada bir kez göster
  // --- NEW: Danışman seçimi (worker listesi) ---
  const [workers, setWorkers] = useState<Worker[]>([])
  const [workersLoading, setWorkersLoading] = useState<boolean>(true)
  const [workersError, setWorkersError] = useState<string | null>(null)

useEffect(() => {
  if ((workers || []).length > 0) {
    loadMetaBatch();
  }
}, [workers.length]);


// Çalışan meta cache: foto + ünvan
const [workerMeta, setWorkerMeta] = useState<Record<string, { photoUrl?: string | null; title?: string | null }>>({})

      async function loadMetaBatch() {
        try {
          const ids = (workers || []).map(w => w.id).filter(Boolean)
          if (!ids.length) return
          const r = await fetch(`/api/workers/meta?ids=${ids.join(",")}`, { cache: "no-store" })
          const j = await r.json()
          if (j?.ok && Array.isArray(j.data)) {
            const next: Record<string, { photoUrl?: string | null; title?: string | null }> = {}
            for (const it of j.data) {
              next[it.id] = { photoUrl: it.photoUrl || null, title: it.title || null }
            }
            setWorkerMeta(prev => ({ ...prev, ...next }))
          }
        } catch (e) {
         
        }
      }
    
const prefetchWorkerMeta = async (id: string) => {
  if (!id || workerMeta[id]) return
  try {
    const r = await fetch(`/api/cv/preview/${id}`, { cache: "no-store" })
    const j = await r.json()
    if (j?.ok) {
      const title = (j.data?.locale === "en")
        ? (j.data?.profile?.title_en || null)
        : (j.data?.profile?.title_tr || null)
      const photoUrl = j.data?.photoUrl || null
      setWorkerMeta(prev => ({ ...prev, [id]: { photoUrl, title } }))
    }
  } catch {}
}

  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("")
  const [showCv, setShowCv] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    async function loadWorkers() {
      setWorkersLoading(true)
      setWorkersError(null)
      try {
        // Beklenen minimal JSON: [{ id, name, email? }]
        // Var olan API'nizde /api/workers uç noktası bulunduğunu varsayıyoruz.
        const r = await fetch("/api/workers", { method: "GET" })
        if (!r.ok) throw new Error(t("errors.workersFetch"))
        const data = await r.json()
        const list: Worker[] = Array.isArray(data) ? data : (data?.data ?? [])
        if (!cancelled) setWorkers(list.filter(w => w && w.id && (w.name || w.email)))
      } catch (e: any) {
        if (!cancelled) setWorkersError(e?.message || t("errors.workersFetch"))
      } finally {
        if (!cancelled) setWorkersLoading(false)
      }
    }
    loadWorkers()
    return () => { cancelled = true }
  }, [])

  const [resp, setResp] = useState<ApiResp | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Açılır menü (custom) için durumlar
  const [open, setOpen] = useState<boolean>(false)
  const [hoverId, setHoverId] = useState<string | null>(null)


  // File input (görsel iyileştirme: gizli input + buton)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const triggerFilePicker = () => fileInputRef.current?.click()

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || [])
    if (!picked.length) return
    setFiles(prev => [...prev, ...picked])
    e.currentTarget.value = ""
  }
  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i))

  async function handleAuto(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setResp(null)
    setErrorMsg(null); setErrorDetail(null); setErrorCode(null)

    try {
      const fd = new FormData()
      fd.set("title", title)
      fd.set("description", description)
      fd.set("isUrgent", String(isUrgent))
      fd.set("pages", String(Number.isFinite(pages) ? pages : 0))
      // --- NEW: seçilen danışmanı API'ye ilet (backend yoksa yoksayar) ---
      if (selectedWorkerId) fd.set("assignedTo", selectedWorkerId)
      files.forEach(f => fd.append("files", f))

      const r = await fetch("/api/ask/auto", { method: "POST", body: fd })
      const j: ApiResp = await r.json()
      if (!r.ok || !j?.ok) {
        setErrorMsg(j?.error || t("errors.actionFailed"))
        setErrorDetail(j?.detail || null)
        setErrorCode(j?.code || null)
      } else {
const id = resolveQuestionId(j)
if (id) {
  // 1) Seçilen dosyaları Storage'a yükle (scope=question) → listeleme prefix'leriyle uyumlu
   if (files.length > 0) {
     try {
       const uploads = files.map((f) => {
        const ufd = new FormData()
         ufd.set("question_id", id)
         ufd.set("scope", "question")
        ufd.append("file", f, (f as any).name || f.name || "file")
        return fetch("/api/storage/upload", { method: "POST", body: ufd })
       })
      const results = await Promise.all(uploads)
       const bad = results.find(r => !r.ok)
       if (bad) {
        setErrorMsg(t("errors.actionFailed"))
         setErrorDetail("upload_failed")
        setSubmitting(false)
         return
       }
     } catch (e: any) {
       setErrorMsg(t("errors.unexpected"))
       setErrorDetail(String(e?.message || e))
      setSubmitting(false)
       return
    }
   }
  // [PRECHECK] Ask submit: precheck çalıştır, yalnız 'passed' ise redirect et.
  try {
    
    // Basit locale tespiti (domain tabanlı)
    const locale = (typeof window !== 'undefined' && /(^|.)tr.easycustoms360.com(?::\d+)?$/i.test(window.location.hostname)) ? 'en' : 'tr'

    // UI: kısa bekleme metni (opsiyonel) — mevcut UI'yı bozmadan alert yerine seulement console
    // İstersen burada bir state ile "Ön kontrol yapılıyor…" gösterebilirsin.

    setPrecheckBusy(true);
            const pr = await fetch('/api/gpt/precheck/autorun', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id: id, locale }),
      cache: 'no-store',
    })
    const pj = await pr.json().catch(() => ({}))
            setPrecheckBusy(false)
    
    // L2: required varsa teklife geçişi durdur → modal
    try {
      if (pj?.auto?.l2Enabled === false) { /* L2 kapalı */ };
        const requiredCount = Array.isArray(pj?.auto?.l2MissingEffective?.required) ? pj.auto.l2MissingEffective.required.length : (Array.isArray(pj?.l2?.result?.missing?.required) ? pj.l2.result.missing.required.length : 0);
      
const shouldCount = Array.isArray(pj?.auto?.l2MissingEffective?.should) ? pj.auto.l2MissingEffective.should.length : (Array.isArray(pj?.l2?.result?.missing?.should) ? pj.l2.result.missing.should.length : 0);
const policyEff = pj?.auto?.l2PolicyEffective || pj?.auto?.l2Policy || { mode: 'required_only', should_max: 0 };
const l2Pass = (typeof pj?.auto?.l2Pass === 'boolean')
  ? pj.auto.l2Pass
  : (policyEff.mode === 'required_and_should' ? (requiredCount === 0 && shouldCount <= (policyEff.should_max ?? 0)) : (requiredCount === 0));
if (!l2Pass) {
  setShowL2(true);
  setL2Data({ status: 'ok', missing: pj?.auto?.l2MissingEffective || pj?.l2?.result?.missing || { required: [], should: [], info: [] } });
  setLastQuestionId(id);
  return;
}

        if (requiredCount > 0) {
        setShowL2(true);
        setL2Data(pj.l2.result);
        setLastQuestionId(id);
        return;
      }
    } catch {}


    if (!pr.ok || pj?.ok === false) {
      alert(t("precheck.failed"))
      return
    }

    if (pj.status === 'passed') {
      return router.replace(`/ask/${id}`)
    }
    if (pj.status === 'meaningless') {
      alert(locale === 'tr'
        ? t("precheck.notClear")
        : 'Your question is not sufficiently clear. Please add item/HS code, procedure, and context.'
      )
      return
    }
    if (pj.status === 'non_customs') {
      alert(locale === 'tr'
        ? t("precheck.outOfScope")
        : 'Your question appears outside the scope of customs regulations.'
      )
      return
    }

    // Diğer: error/null — redirect yok
    alert(t("precheck.error"))
    return
  } catch (e) {
    
    alert(t("precheck.error"))
    return
  }
}
      }
    } catch (err: any) {
      setErrorMsg(t("errors.unexpected"))
      setErrorDetail(String(err?.message || err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
<div className="bg-gradient-to-b from-white to-slate-0 py-1 -mx-2 md:mx-0">
  <div className="px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
    <div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 mb-4 flex items-center gap-3">
      <button type="button" className="btn btn--primary btn--cta whitespace-nowrap">
        {t("header.title")}   {/* Soru Sor */}
      </button>
      <p className="text-sm text-blue-800">
        {t("header.lead")}
      </p>
    </div>
    <div className="card-surface shadow-colored p-5 md:p-6 space-y-5">
      <BusyOverlay show={precheckBusy} labelTR={t("busyAnalyzing")} />
<AskAiNoticeModal />

      <form onSubmit={handleAuto} encType="multipart/form-data" className="space-y-4">
        {/* --- NEW: Danışman seçimi (Başlık alanının ÜSTÜNE) --- */}
        

        
{/* Danışman seçimi ve açıklama */}
<div className="text-sm font-medium mb-2">{t("worker.title")}</div>
<div className="card-surface p-4 space-y-2 edge-underline edge-blue edge-taper edge-rise-2mm">
<div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-[auto_auto] gap-4 items-start">
  {/* Sol: açılır liste (hover önizleme destekli) */}
  <div className="space-y-2 relative">
    <label className="sr-only">{t("worker.label")}</label>
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full card-surface p-2 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedWorkerId
          ? (workers.find(w => w.id === selectedWorkerId)?.name || t("worker.selected"))
          : (workersLoading ? t("worker.loading") : t("worker.selectOptional"))}
      </button>
      <input type="hidden" name="assignedTo" value={selectedWorkerId} />

      {open && (
      <div className="absolute z-20 mt-1 w-full card-surface edge-underline edge-teal edge-taper edge-rise-2mm max-h-72 overflow-auto">
          {workers.map((w) => (
            <div
              key={w.id}
              role="option"
              aria-selected={selectedWorkerId === w.id}
              onMouseEnter={() => setHoverId(w.id)}
              onFocus={() => setHoverId(w.id)}
              onClick={() => { setSelectedWorkerId(w.id); setOpen(false); }}
              className={"px-3 py-2 cursor-pointer hover:bg-gray-50 " + (selectedWorkerId === w.id ? "bg-gray-50" : "")}
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-gray-200">
                  {workerMeta[w.id]?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={workerMeta[w.id]?.photoUrl as string} alt={w.name || w.email || t("worker.avatarAlt")} className="w-12 h-12 object-cover" />

                  ) : (
                    <div className="w-12 h-12 flex items-center justify-center text-[12px] text-gray-600 font-medium">
                      {(w.name || w.email || "?").split(" ").slice(0,2).map(s=>s[0]?.toUpperCase()).join("")}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{w.name || w.email}</div>
                  <div className="text-xs text-gray-500 truncate">{workerMeta[w.id]?.title || ""}</div>
                </div>
              </div>
            </div>
          ))}
          {!workers.length && !workersLoading && (
            <div className="px-3 py-2 text-sm text-slate-700">{t("worker.empty")}</div>
          )}
        </div>
      )}
    </div>

{workersError && <div className="text-xs text-red-600">{workersError}</div>}
              {/* CV İncele (seçili danışmanın CV önizlemesi) */}
<div className="flex justify-end">
  <button
    type="button"
    onClick={() => selectedWorkerId && setShowCv(true)}
    disabled={!selectedWorkerId}
    className="btn btn--outline text-sm h-10 px-4"
    title={t("worker.openPreview")}
  >
    {t("worker.preview")}
  </button>
</div>
            </div>


  {/* Sağ: açıklama metni */}
<div className="card-surface md:row-span-1 md:self-stretch h-full text-sm p-2 leading-snug text-slate-800">
  {t("worker.helpText")}
</div>
</div>
</div>

        {/* Başlık */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t("form.titleLabel")}</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t("form.titlePlaceholder")}
            className="w-full border rounded-lg p-2"
            required
            minLength={3}
            name="title"
          />
        </div>

        {/* Açıklama */}
<div className="flex items-center justify-between">
  <label className="text-sm font-medium">{t("form.descLabel")}</label>
  <button
    type="button"
    onClick={() => setShowDescHelp(true)}
    className="text-xs text-indigo-700 hover:underline"
  >
    {t("form.descHelp.open")}
  </button>
</div>

<div
  className="card-surface p-3 mt-1 edge-underline edge-blue edge-taper edge-rise-2mm"
  onClick={() => {
    if (!descHelpShownRef.current) {
      setShowDescHelp(true)
      descHelpShownRef.current = true
    }
  }}
>

  <textarea
  ref={descRef}
    value={description}
    onChange={e => setDescription(e.target.value)}
    placeholder={t("form.descPlaceholder")}
    rows={5}
    className="w-full bg-transparent outline-none resize-y min-h-[120px]"
    name="description"
  />
</div>

        {/* Öncelik (Acil) — buton şeklinde toggle */}
        <div className="space-y-2">

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsUrgent(v => !v)}
              aria-pressed={isUrgent}
 className={
  "btn rounded-full px-4 py-2 text-sm " +
  (isUrgent ? "btn--danger" : "btn--danger-light")
}
              title={t("urgent.title")}
            >
              {t("urgent.label")}
              {/* Tek kelime istek: 'Acil'. Renk değişimi ile durum vurgulanır. */}
            </button>
            <span className="text-xs text-gray-500">{t("urgent.note")}</span>
          </div>
        </div>

        {/* Dosyalar — Görsel iyileştirme */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t("files.header")}</label>
          {/* Gizli gerçek input */}
          <input ref={fileInputRef} type="file" multiple onChange={onFilePick} className="hidden" />

          {/* Küçük seçim butonu */}
<div className="flex items-center gap-3">
  <button
    type="button"
    onClick={triggerFilePicker}
    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 active:scale-[0.99] transition"
  >
    {/* Paperclip icon */}
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12.79V7a5 5 0 00-10 0v10a3 3 0 006 0V8" />
    </svg>
    {t("files.choose")}
  </button>
  <span className="text-xs text-gray-500">{t("files.hint")}</span>
</div>


          {/* Seçilen dosyalar listesi */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500">{t("files.selectedList")}</div>
              <ul className="grid grid-cols-1 gap-2">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3 shadow-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-100">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5 text-gray-600">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 3h6l4 4v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-800" title={f.name}>{f.name}</div>
                        <div className="text-xs text-gray-500">{formatBytes(f.size)}{f.type ? ` • ${f.type}` : ''}</div>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeFile(i)} className="btn btn--outline h-8 px-2 text-xs">

                      {t("files.remove")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Aksiyonlar */}
        <div className="flex items-center justify-center gap-3">
         <button disabled={submitting} className="btn btn--primary text-sm h-10 px-4 disabled:opacity-50">
            {submitting ? t("submit.calculating") : t("submit.calcOffer")}
          </button>
        </div>

        {errorMsg && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
            <div className="font-medium">{errorMsg}</div>
            {errorCode && <div className="text-xs">{t("errors.codeLabel")}: {errorCode}</div>}
            {errorDetail && <pre className="text-xs whitespace-pre-wrap">{errorDetail}</pre>}
          </div>
        )}
      

{/* CV Önizleme Modal */}
{showCv && selectedWorkerId ? (
  <div className="fixed inset-0 z-40">
    {/* backdrop */}
    <div className="absolute inset-0 bg-black/40" onClick={() => setShowCv(false)} />
    {/* dialog */}
    <div className="absolute inset-0 grid place-items-center p-4">
      <div className="w-full max-w-full md:max-w-4xl bg-white rounded-2xl shadow-xl border overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-medium">{t("cvPreview.title")}</div>
          <button
            type="button"
            onClick={() => setShowCv(false)}
            className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
            aria-label={t("cvPreview.close")}
          >
            {t("cvPreview.close")}
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto overflow-x-auto p-4">
          <CvPreviewById workerId={selectedWorkerId} />
        </div>
      </div>
    </div>
  </div>
) : null}


      </form>
	  {/* Açıklama yazım yardımı popup */}
{showDescHelp && (
  <Modal
    open={showDescHelp}
    onClose={() => {
      setShowDescHelp(false)
      setTimeout(() => descRef.current?.focus(), 0)
    }}
    widthClassName="md:max-w-2xl"
  >
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-9 w-9 shrink-0 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center text-lg">
          💡
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-red-600">
            {t("form.descHelp.title")}
          </h2>
          <p className="mt-1 text-[15px]">{t("form.descHelp.intro")}</p>
        </div>
      </div>

      <ul className="space-y-2  text-sm text-gray-600 leading-relaxed">
        <li> {t("form.descHelp.bullets.files")}</li>
        <li> {t("form.descHelp.bullets.scope")}</li>
        <li> {t("form.descHelp.bullets.work")}</li>
        <li>• {t("form.descHelp.bullets.lang")}</li>
        <li>• {t("form.descHelp.bullets.time")}</li>
        <li> {t("form.descHelp.bullets.risk")}</li>
        <li> {t("form.descHelp.bullets.open")}</li>
      </ul>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => {
            setShowDescHelp(false)
            setTimeout(() => descRef.current?.focus(), 0)
          }}
          className="rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
        >
          {t("form.descHelp.closeWrite")}
        </button>
        <button
          type="button"
          onClick={() => setShowDescHelp(false)}
          className="rounded-xl border px-4 py-2 text-gray-700 hover:bg-gray-50"
        >
          {t("form.descHelp.close")}
        </button>
      </div>
    </div>
  </Modal>
)}

      {/* Sonuç özeti (yönlendirme öncesi kısa gösterim) */}
      {resp?.ok && resp.pricing && (
     <div className="card-surface p-4 space-y-3 edge-underline edge-blue edge-taper edge-rise-2mm">
          <h2 className="font-semibold">{t("result.title")}</h2>
          {resp.auto?.mode && (
            <div className="text-xs">
  {t("result.mode")}: {resp.auto.mode === "gpt" ? "GPT" : "Heuristic"}
</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div><b>{t("result.estHours")}</b>: {resp.pricing.estHours.toFixed(2)} {t("result.hours")}</div>
<div><b>{t("result.daysNormal")}</b>: {resp.pricing.estDaysNormal} {t("result.days")}</div>
<div><b>{t("result.daysUrgent")}</b>: {resp.pricing.estDaysUrgent} {t("result.days")}</div>
            <div><b>{t("result.price")}</b>: {nf2.format(resp.pricing.priceFinal)} {t("result.currencyTRY")}</div>
            <div><b>{t("result.targetDue")}</b>: {new Date(resp.pricing.slaDueAt).toLocaleString(locale)}</div>

            <div><b>{t("result.calc")}</b>: {(resp.pricing.calcMode || "—")} • {t("result.minFee")}: {nf2.format(resp.pricing.minFee)} {t("result.currencyTRY")} • {t("result.urgentMult")} ×{resp.pricing.urgentMultiplier}</div>
 </div>
        </div>
      )}
    
        {showL2 && (
               <Level2Modal
         data={l2Data || { status: 'ok', missing: { required: [], should: [], info: [] } }}
            onEdit={() => { setShowL2(false); }}
            onContinue={() => { setShowL2(false); if (lastQuestionId) router.replace(`/ask/${lastQuestionId}`); }}
            onClose={() => setShowL2(false)}
        />
        )}
</div></div></div>
  )
}