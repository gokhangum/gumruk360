import Link from "next/link"
import { headers } from "next/headers"
import { supabaseAdmin } from "../../../lib/supabase/serverAdmin"
import { revalidatePath } from "next/cache"
type TicketRow = {
  id: string
  created_at: string
  subject: string
  status: "open" | "answered" | "closed"
  user_id: string
  question_id: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
}

async function absoluteBaseUrl() {
  const h = await headers()
  const host = (h.get("x-forwarded-host") || h.get("host") || "localhost:3000").toLowerCase()
  const proto = (h.get("x-forwarded-proto") || "http").toLowerCase()
  return `${proto}://${host}`
}

 function questionEditorHrefAbs(base: string, id: string, email?: string | null) {
   const url = `${base}/admin/request/${id}`
   return email ? `${url}?email=${encodeURIComponent(email)}` : url
 }
 
 async function deleteTicketAction(formData: FormData) {
   "use server";
  const id = String(formData.get("id") || "");
   if (!id) return;
  await supabaseAdmin.from("contact_tickets").delete().eq("id", id);
  revalidatePath("/admin/contact");
 }
 
 export default async function AdminContactListPage() {
   const s = supabaseAdmin

  const base = await absoluteBaseUrl()

  const { data: tickets, error } = await s
    .from("contact_tickets")
    .select("id, created_at, subject, status, user_id, question_id")
    .order("created_at", { ascending: false })

  const rows = (tickets || []) as TicketRow[]

  const userIds = Array.from(new Set(rows.map((t) => t.user_id))).filter(Boolean)
  let profileMap = new Map<string, ProfileRow>()
  if (userIds.length > 0) {
    const { data: profs } = await s
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds)

    for (const p of (profs || []) as ProfileRow[]) {
      profileMap.set(p.id, p)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">İletişim Talepleri</h1>
      </div>

      {error && <div className="text-red-600 text-sm">Liste hatası: {error.message}</div>}

      <div className="border rounded overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="px-3 py-2">Tarih</th>
              <th className="px-3 py-2">Kullanıcı</th>
              <th className="px-3 py-2">Konu</th>
              <th className="px-3 py-2">Soru</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const p = profileMap.get(t.user_id)
              const userText = p?.full_name
                ? `${p.full_name}${p.email ? ` (${p.email})` : ""}`
                : (p?.email || "—")

              const qLink = t.question_id
                ? questionEditorHrefAbs(base, t.question_id, p?.email || null)
                : null

              return (
                <tr key={t.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{userText || "—"}</td>
                  <td className="px-3 py-2">{t.subject}</td>
                  <td className="px-3 py-2">
                    {qLink ? (
                      <a className="text-blue-700 underline" href={qLink} target="_blank" rel="noopener noreferrer">
                        {t.question_id}
                      </a>
                    ) : "—"}
                  </td>
                          <td className="px-3 py-2">
                  {t.status === "open" ? "Açık" : t.status === "answered" ? "Yanıtlandı" : "Kapalı"}
                  </td>
              <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                   <Link className="px-2 py-1.5 rounded border hover:bg-gray-50" href={`/admin/contact/${t.id}`}>
                      Aç
                   </Link>
                      <form action={deleteTicketAction}>
                       <input type="hidden" name="id" value={t.id} />
                       <button type="submit" className="px-2 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50">
                          Sil
                       </button>
                      </form>
                    </div>
                  </td>

                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={6}>
                  Kayıt yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
