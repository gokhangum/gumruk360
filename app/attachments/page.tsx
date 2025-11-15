"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl";
type Item = {
  id: string
  original_name: string
  size: number
  content_type: string
  object_path: string
  created_at: string
  question_id?: string | null
}

function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

export default function AttachmentsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [questionId, setQuestionId] = useState<string>("")
  const [msg, setMsg] = useState<string>("")
const t = useTranslations("attachments");
const tCommon = useTranslations("common");
const tProg = useTranslations("progress");
  async function load() {
    const res = await fetch("/api/storage/list")
    if (!res.ok) {
      setMsg(t("errors.listFailedLogin"));
      return
    }
    const data = await res.json()
    setItems(data.items || [])
  }

  useEffect(() => { load() }, [])

  async function onUpload(e: React.FormEvent) {
    e.preventDefault()
    setMsg("")
    if (!file) { setMsg(t("errors.chooseFile")); return }
    const fd = new FormData()
    fd.set("file", file)
    fd.set("filename", file.name)
    if (questionId && isUUID(questionId)) {
      fd.set("question_id", questionId)
    }
    setBusy(true)
    const res = await fetch("/api/storage/upload", { method: "POST", body: fd })
    setBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(()=>({}))
      setMsg(t("errors.uploadFailedDetail", { detail: err?.detail || res.statusText }));
      return
    }
    setFile(null)
    ;(document.getElementById("file") as HTMLInputElement).value = ""
    setQuestionId("")
    await load()
    setMsg(t("messages.uploaded"));
  }

  async function onDownload(id: string) {
    const res = await fetch(`/api/storage/download?id=${encodeURIComponent(id)}`)
    if (!res.ok) {
      const err = await res.json().catch(()=>({}))
      setMsg(t("errors.downloadLinkFailedDetail", { detail: err?.detail || res.statusText }));
      return
    }
    const data = await res.json()
    window.open(data.url, "_blank")
  }

  async function onDelete(id: string) {
    if (!confirm(t("confirmDelete"))) return
    const res = await fetch("/api/storage/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      const err = await res.json().catch(()=>({}))
      setMsg(t("errors.deleteFailedDetail", { detail: err?.detail || res.statusText }));
      return
    }
    await load()
    setMsg(t("messages.deleted"));
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <form onSubmit={onUpload} className="border rounded-xl p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input id="file" type="file" onChange={(e)=>setFile(e.target.files?.[0] || null)} className="flex-1" />
          <input
            type="text"
            value={questionId}
            onChange={(e)=>setQuestionId(e.target.value.trim())}
            placeholder={t("form.questionIdPlaceholder")}

            className="border rounded-lg p-2 w-full sm:w-64"
          />
          <button
            type="submit"
            disabled={busy}
            className="border rounded-lg px-4 py-2 bg-black text-white disabled:opacity-60"
          >
            {busy ? tProg("processing") : t("actions.upload")}
          </button>
        </div>
        <p className="text-xs text-gray-600">{t("form.maxNote")}</p>

      </form>

      {msg && <p className="text-sm">{msg}</p>}

      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
           <th className="text-left p-2">{t("table.name")}</th>
<th className="text-left p-2">{t("table.size")}</th>
<th className="text-left p-2">{t("table.type")}</th>
<th className="text-left p-2">{t("table.questionId")}</th>
<th className="text-left p-2">{t("table.date")}</th>
<th className="p-2">{t("table.action")}</th>

            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
             <tr><td className="p-2" colSpan={6}>{t("table.empty")}</td></tr>

            )}
            {items.map(it => (
              <tr key={it.id} className="border-t">
                <td className="p-2">{it.original_name}</td>
                <td className="p-2">{(it.size/1024).toFixed(1)} KB</td>
                <td className="p-2">{it.content_type}</td>
                <td className="p-2">{it.question_id || "-"}</td>
                <td className="p-2">{new Date(it.created_at).toLocaleString()}</td>
                <td className="p-2 text-right">
                 <button onClick={()=>onDownload(it.id)} className="underline mr-3">{t("actions.download")}</button>

                  <button onClick={()=>onDelete(it.id)} className="underline text-red-600">{tCommon("delete")}</button>

                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

     <div><a className="underline" href="/profile">{t("backProfile")}</a></div>

    </div>
  )
}
