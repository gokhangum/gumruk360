import Link from "next/link"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { supabaseServer } from "../../../lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { getTranslations } from "next-intl/server"
import { MAIL } from "../../../lib/config/appEnv";
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

async function absoluteBaseUrl() {
  const h = await headers()
  const host = (h.get("x-forwarded-host") || h.get("host") || "localhost:3000").toLowerCase()
  const proto = (h.get("x-forwarded-proto") || "http").toLowerCase()
  return `${proto}://${host}`
}

const resendKey = process.env.RESEND_API_KEY || ""
const resend = resendKey ? new Resend(resendKey) : null

type TicketRow = {
  id: string
  created_at: string
  subject: string
  status: "open" | "answered" | "closed"
  user_id: string
  question_id: string | null
}

export default async function SupportListPage() {
  const s = await supabaseServer()
const t = await getTranslations("support")

  // Oturum
  const { data: u } = await s.auth.getUser()
  if (!u?.user?.id) {
    return (
      <div className="p-6">
       <h1 className="text-2xl font-semibold mb-2">{t("title")}</h1>

       <p className="text-sm text-gray-600">{t("pleaseLogin")}</p>

      </div>
    )
  }
  const userId = u.user.id

  // Kullanıcının ticket'ları
  const { data, error } = await s
    .from("contact_tickets")
    .select("id, created_at, subject, status, question_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  const rows = (data || []) as TicketRow[]

  // --- Actions ---
  async function deleteTicketAction(formData: FormData) {
    "use server"
	const t = await getTranslations("support")

    const s2 = await supabaseServer()
    const a = admin()
    const { data: u2 } = await s2.auth.getUser()
   if (!u2?.user?.id) throw new Error(t("errors.loginRequired"))

    const myId = u2.user.id

    const id = String(formData.get("id") || "")
    if (!id) throw new Error(t("errors.missingId"))


    // Sahiplik kontrolü
    const { data: tkt } = await a.from("contact_tickets").select("id,user_id").eq("id", id).single()
if (!tkt || tkt.user_id !== myId) throw new Error(t("errors.unauthorized"))


    // Ekler → storage'tan sil
    const { data: atts } = await a
      .from("contact_attachments")
      .select("object_path")
      .eq("ticket_id", id)
    const paths = (atts || []).map((x: any) => x.object_path).filter(Boolean)
    if (paths.length) {
      await a.storage.from("attachments").remove(paths)
    }

    // DB silme sırası: attachments → messages → ticket
    await a.from("contact_attachments").delete().eq("ticket_id", id)
    await a.from("contact_messages").delete().eq("ticket_id", id)
    await a.from("contact_tickets").delete().eq("id", id)

    // Audit
    await a.from("audit_logs").insert({
      actor_role: "user",
      action: "ticket.delete",
      resource_type: "ticket",
      resource_id: id,
      event: "ticket.delete",
      entity_type: "ticket",
      entity_id: id,
    })

    revalidatePath("/dashboard/support")
  }

  async function markResolvedAction(formData: FormData) {
    "use server"
    const t = await getTranslations("support")

    const a = admin()
    const base = await absoluteBaseUrl()
const s2 = await supabaseServer()
    const { data: u2 } = await s2.auth.getUser()
    if (!u2?.user?.id) throw new Error(t("errors.loginRequired"))

    const myId = u2.user.id

    const id = String(formData.get("id") || "")
    if (!id) throw new Error(t("errors.missingId"))


const { data: tkt } = await a
  .from("contact_tickets")
  .select("id,user_id,question_id")
  .eq("id", id)
  .single()
if (!tkt || tkt.user_id !== myId) throw new Error(t("errors.unauthorized"))



    // Status → closed
    await a.from("contact_tickets").update({ status: "closed" }).eq("id", id)

    // Audit
    await a.from("audit_logs").insert({
      actor_role: "user",
      action: "ticket.close",
      resource_type: "ticket",
      resource_id: id,
      event: "ticket.close",
      entity_type: "ticket",
      entity_id: id,
      question_id: tkt.question_id ?? null,
    })

    // Soruya bağlıysa adminlere “çözüldü bildirildi” maili
    {
      const { data: me } = await a.from("profiles").select("email,full_name").eq("id", myId).single()
      const senderEmail = me?.email || ""
      const senderName = me?.full_name || senderEmail || t("email.userFallbackName")

      const qLink = tkt.question_id
   ? `${base}/admin/request/${tkt.question_id}?email=${encodeURIComponent(senderEmail)}`
   : null
 const cLink = `${base}/admin/contact/${id}`


      const { data: admins } = await a
        .from("profiles")
        .select("email")
        .eq("role", "admin")
        .not("email", "is", null)

      let toList = (admins || []).map((p: any) => p.email).filter(Boolean) as string[]
      const fallback = process.env.ADMIN_EMAILS || process.env.SUPPORT_EMAIL || ""
      if (!toList.length && fallback) toList = [fallback]

      if (toList.length && resend) {
        const subject = t("email.resolvedSubject")

const html = `
           <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;font-size:14px">
             ${
               qLink
                 ? '<p><strong>' + t("email.questionId") + ':</strong> <a href="' + qLink + '" target="_blank" rel="noopener noreferrer">' + (tkt.question_id || "") + '</a></p>'
                 : '<p><strong>' + t("email.ticket") + ':</strong> <a href="' + cLink + '" target="_blank" rel="noopener noreferrer">' + id + '</a></p>'
             }
             <p><strong>${t("email.reportedBy")}:</strong> ${senderName} &lt;${senderEmail}&gt;</p>
             <p>${t("email.markedResolved")}</p>
           </div>
         `
        await resend.emails.send({
          from: process.env.MAIL_FROM || process.env.EMAIL_FROM || `${MAIL.fromName} <${MAIL.fromEmail}>`,
          to: toList,
          subject,
          html,
        })
      }
    }

    revalidatePath("/dashboard/support")
  }

  return (

 <div className="w-full max-w-none -mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
    <div className="card-surface shadow-colored rounded-xl">
        <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-semibold">{t("title")}</h1>

   <Link href="/dashboard/contact" className="btn btn--primary btn--cta text-sm">
  {t("createNew")}
</Link>

            </div>
      </div>
      <div className="p-5 overflow-x-auto">

      {error && <div className="text-red-600 text-sm">{t("listError")}: {error.message}</div>}


      <div className="hidden md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="px-3 py-2">{t("table.date")}</th>
              <th className="px-3 py-2">{t("table.subject")}</th>
              <th className="px-3 py-2">{t("table.status")}</th>
              <th className="px-3 py-2">{t("table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                 <td className="px-3 py-2">
    {row.question_id ? (
      <Link
        className="text-blue-700 underline block truncate max-w-[340px]"
        href={`/dashboard/questions/${row.question_id}`}
      >
        {row.subject}
      </Link>
    ) : (
      <span className="block truncate max-w-[340px]">{row.subject}</span>
    )}
  </td>

                <td className="px-3 py-2">
 {row.status === "open"
   ? t("status.open")
   : row.status === "answered"
   ? t("status.answered")
   : t("status.closed")}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
             <Link className="btn btn--ghost text-sm" href={`/dashboard/support/${row.id}`}>
  {t("view")}
</Link>

                    {/* Çözüldü */}
                    <form action={markResolvedAction}>
                      <input type="hidden" name="id" value={row.id} />
               <button className="btn btn--ghost text-sm" type="submit">
  {t("resolved")}
</button>
                    </form>

                    {/* Sil */}
                    <form action={deleteTicketAction}>
                      <input type="hidden" name="id" value={row.id} />
           <button className="btn btn--danger text-sm" type="submit">
  {t("delete")}
</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={5}>
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>  
	      {/* Mobile stacked list */}
     <div className="md:hidden divide-y">
         {rows.map((row) => (
           <div key={row.id} className="py-3">
             <div className="text-xs text-gray-500">{t("table.date")}</div>
             <div className="font-medium">{new Date(row.created_at).toLocaleString()}</div>
 
            <div className="mt-2 text-xs text-gray-500">{t("table.subject")}</div>
             <div>{row.subject}</div>

          <div className="mt-2 text-xs text-gray-500">{t("table.question")}</div>
            <div>
             {row.question_id ? (
                 <Link className="text-blue-700 underline" href={`/dashboard/questions/${row.question_id}`}>
                  {row.question_id}
                 </Link>
             ) : "—"}
            </div>
 
           <div className="mt-2 text-xs text-gray-500">{t("table.status")}</div>
             <div>
             {row.status === "open"
               ? t("status.open")
                 : row.status === "answered"
                ? t("status.answered")
                 : t("status.closed")}
             </div>
 
            <div className="mt-3 flex items-center gap-2">
			 {/* Görüntüle */}
            <Link href={`/dashboard/support/${row.id}`} className="btn btn--ghost text-sm md:whitespace-nowrap">
                 {t("view")}
               </Link>
              {/* Çözümle */}
              <form action={markResolvedAction}>
                <input type="hidden" name="id" value={row.id} />
               <button className="btn btn--ghost text-sm" type="submit">
                 {t("resolved")}
              </button>
              </form>
              {/* Sil */}
              <form action={deleteTicketAction}>
                 <input type="hidden" name="id" value={row.id} />
                <button className="btn btn--danger text-sm" type="submit">
                 {t("delete")}
                </button>
              </form>
             </div>
          </div>
        ))}

       {rows.length === 0 && (
         <div className="py-6 text-center text-gray-500">
           {t("empty")}
         </div>
         )}
       </div>

    </div>   
  </div>     
     
      </div>
 
  )
}
