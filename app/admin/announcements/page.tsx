import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { supabaseAdmin } from "../../../lib/supabase/serverAdmin"
import { createClient as createAdminClient } from "@supabase/supabase-js"

type Announcement = {
  id: string
  created_at: string
  tenant_id: string | null
  type: "news" | "notice"
  lang: "tr" | "en"
  title: string
  body: string
  audience: "all_users" | "all_workers" | "all_owners" | "specific"
  status: "draft" | "published"
  published_at: string | null
  created_by: string
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

async function publishAction(formData: FormData) {
  "use server"
  const id = String(formData.get("id") || "")
  if (!id) throw new Error("Geçersiz id")

  const a = admin()

  // Duyuru + ekleri
  const { data: ann, error: getErr } = await a
    .from("announcements")
    .select("id, lang, audience, title, tenant_id")
    .order("created_at", { ascending: false })
    .range(0, 49)
    .eq("id", id)
    .single()
  if (getErr || !ann) throw new Error("Duyuru bulunamadı")
// Seçili tenant varsa code + locale alalım (dil için kullanacağız)
let tenantCode: string | null = null
let tenantLocale: string | null = null
if ((ann as any).tenant_id) {
  const { data: t } = await a
    .from("tenants")
    .select("code, locale")
    .eq("id", (ann as any).tenant_id)
    .single()
  tenantCode = t?.code || null
  tenantLocale = t?.locale || null
}


  const { data: annFiles } = await a
    .from("announcement_attachments")
    .select("object_path, file_name, mime")
    .eq("announcement_id", id)

  const attachmentsPayload = (annFiles || []).map((f: any) => ({
    path: f.object_path,
    file_name: f.file_name,
    mime: f.mime
  }))

  // Yayınla
  const { error: upErr } = await a
    .from("announcements")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", id)
  if (upErr) throw new Error("Publish hatası: " + upErr.message)

  // Audit
  await a.from("audit_logs").insert({
    actor_role: "admin",
    action: "announcement.publish",
    resource_type: "announcement",
    resource_id: id,
    event: "announcement.published",
    entity_type: "announcement",
    entity_id: id,
  })

  // Alıcılar
  let emails: { email: string; tenant_key: string | null }[] = []
  if (ann.audience === "specific") {
  const { data: targets } = await a
    .from("announcement_targets")
    .select("user_id")
     .eq("announcement_id", id)
   const userIds = (targets || []).map((t: any) => t.user_id)
   if (userIds.length > 0) {
    const { data: profs } = await a
      .from("profiles")
      .select("email, tenant_key")
      .in("id", userIds)
   emails = (profs || []).filter((p: any) => !!p?.email)

    }
 } else if (ann.audience === "all_users") {
   let q = a.from("profiles").select("email, tenant_key").eq("role", "user").not("email", "is", null)
   if (tenantCode) q = q.eq("tenant_key", tenantCode)
   const { data: profs } = await q
   emails = (profs || []).filter((p: any) => !!p?.email)


 } else if (ann.audience === "all_workers") {
   let q = a.from("profiles").select("email, tenant_key").eq("role", "worker").not("email", "is", null)
   if (tenantCode) q = q.eq("tenant_key", tenantCode)
   const { data: profs } = await q
   emails = (profs || []).filter((p: any) => !!p?.email)

  
} else if (ann.audience === "all_owners") {
  const { data: owners } = await a
    .from("organization_members")
    .select("user_id")
    .eq("org_role", "owner")

  const ownerIds = (owners || []).map((o: any) => o.user_id).filter(Boolean)
  if (ownerIds.length > 0) {
    let qp = a.from("profiles").select("email, tenant_key").in("id", ownerIds).not("email", "is", null)
    if (tenantCode) qp = qp.eq("tenant_key", tenantCode)
    const { data: profs } = await qp
    emails = (profs || []).filter((p: any) => !!p?.email)
  } else {
    emails = []
  }
}


 if (emails.length > 0) {
  // 3.a) Tenant seçiliyse: o tenant’ın locale’ine göre tek dilde gönder
  if (tenantLocale) {
    const lang = (tenantLocale || "").toLowerCase().startsWith("en") ? "en" : "tr"
    const subject = lang === "en"
      ? `New announcement: ${ann.title}`
      : `Yeni duyuru: ${ann.title}`
    const rows = (emails as any[]).map((e) => ({
      event: "announcement.published",
      to_email: e.email,
      subject,
      template: "announcement",
      provider: "resend",
      status: "queued",
      entity_type: "announcement",
      entity_id: id,
      payload: { announcement_id: id, lang, attachments: attachmentsPayload },
    }))
    const { error: notifErr } = await a.from("notification_logs").insert(rows)
    if (notifErr) throw new Error("Notification hatası: " + notifErr.message)
  } else {
    // 3.b) Tenant seçili değilse: her alıcının tenant_key'ine göre dili ayır
    // Tüm tenantların locale'ini bir kez al
    const { data: trows } = await a.from("tenants").select("code, locale")
    const localeByCode: Record<string, string> = {}
    for (const r of (trows || [])) {
      localeByCode[r.code] = r.locale || "tr-TR"
    }

    const emailsEN: string[] = []
    const emailsTR: string[] = []
    for (const r of (emails as any[])) {
      const code = r.tenant_key as string | null
      const loc = code ? (localeByCode[code] || "tr-TR") : "tr-TR"
      const lang = loc.toLowerCase().startsWith("en") ? "en" : "tr"
      if (lang === "en") emailsEN.push(r.email); else emailsTR.push(r.email)
    }

    if (emailsEN.length > 0) {
      const subject = `New announcement: ${ann.title}`
      const rows = emailsEN.map((to) => ({
        event: "announcement.published",
        to_email: to,
        subject,
        template: "announcement",
        provider: "resend",
        status: "queued",
        entity_type: "announcement",
        entity_id: id,
        payload: { announcement_id: id, lang: "en", attachments: attachmentsPayload },
      }))
      const { error: e1 } = await a.from("notification_logs").insert(rows)
      if (e1) throw new Error("Notification hatası (EN): " + e1.message)
    }

    if (emailsTR.length > 0) {
      const subject = `Yeni duyuru: ${ann.title}`
      const rows = emailsTR.map((to) => ({
        event: "announcement.published",
        to_email: to,
        subject,
        template: "announcement",
        provider: "resend",
        status: "queued",
        entity_type: "announcement",
        entity_id: id,
        payload: { announcement_id: id, lang: "tr", attachments: attachmentsPayload },
      }))
      const { error: e2 } = await a.from("notification_logs").insert(rows)
      if (e2) throw new Error("Notification hatası (TR): " + e2.message)
    }
  }
}


  revalidatePath("/admin/announcements")
  redirect("/admin/announcements")
}

async function unpublishAction(formData: FormData) {
  "use server"
  const id = String(formData.get("id") || "")
  if (!id) throw new Error("Geçersiz id")
  const a = admin()

  const { error } = await a
    .from("announcements")
    .update({ status: "draft", published_at: null })
    .eq("id", id)
  if (error) throw new Error("Yayından kaldırma hatası: " + error.message)

  await a.from("audit_logs").insert({
    actor_role: "admin",
    action: "announcement.unpublish",
    resource_type: "announcement",
    resource_id: id,
    event: "announcement.unpublished",
    entity_type: "announcement",
    entity_id: id,
  })

  revalidatePath("/admin/announcements")
}

async function deleteAction(formData: FormData) {
  "use server"
  const id = String(formData.get("id") || "")
  if (!id) throw new Error("Geçersiz id")

  const a = admin()

  // 1) Ek dosyaları listele & storage'tan sil
  const { data: files } = await a
    .from("announcement_attachments")
    .select("object_path")
    .eq("announcement_id", id)

  const paths = (files || []).map((f: any) => f.object_path).filter(Boolean)
  if (paths.length > 0) {
    await a.storage.from("attachments").remove(paths)
  }

  // 2) Meta & ilişkili kayıtları temizle
  await a.from("announcement_attachments").delete().eq("announcement_id", id)
  await a.from("announcement_targets").delete().eq("announcement_id", id)
  await a.from("notification_logs").delete().eq("entity_type", "announcement").eq("entity_id", id)

  // 3) Asıl duyuruyu sil
  const { error: delErr } = await a.from("announcements").delete().eq("id", id)
  if (delErr) throw new Error("Silme hatası: " + delErr.message)

  await a.from("audit_logs").insert({
    actor_role: "admin",
    action: "announcement.delete",
    resource_type: "announcement",
    resource_id: id,
    event: "announcement.deleted",
    entity_type: "announcement",
    entity_id: id,
  })

  revalidatePath("/admin/announcements")
}

async function runQueueAction() {
  "use server"
  const h = await headers()
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000"
  const base = `http://${host}`
  const key = process.env.CRON_SECRET || "dev"

  await fetch(`${base}/api/cron/notifications`, {
    method: "POST",
    headers: { "x-cron-secret": key },
    cache: "no-store",
  })

  revalidatePath("/admin/announcements")
}

export default async function AdminAnnouncementsPage() {
  const supabase = supabaseAdmin
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false })

  const items = (data || []) as Announcement[]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Bildirim & Haber</h1>
        <div className="flex gap-2">
          <a
            href="/admin/announcements/new"
            className="px-3 py-2 rounded bg-black text-white hover:opacity-90"
          >
            Yeni Duyuru
          </a>
          <form action={runQueueAction}>
            <button
              type="submit"
              className="px-3 py-2 rounded border hover:bg-gray-50"
              title="Queued e-postaları hemen gönder"
            >
              E-posta Kuyruğunu Çalıştır
            </button>
          </form>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">Liste alınırken hata: {error.message}</div>}

      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="px-3 py-2">Tarih</th>
              <th className="px-3 py-2">Dil</th>
              <th className="px-3 py-2">Tür</th>
              <th className="px-3 py-2">Başlık</th>
              <th className="px-3 py-2">Hedef</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                <td className="px-3 py-2 uppercase">{a.lang}</td>
                <td className="px-3 py-2">{a.type === "news" ? "Haber" : "Bildirim"}</td>

                {/* Başlık tıklanabilir → detay sayfası */}
                <td className="px-3 py-2">
                  <a className="text-blue-700 underline" href={`/admin/announcements/${a.id}`}>
                    {a.title}
                  </a>
                </td>

                <td className="px-3 py-2">
                  {a.audience === "all_users"
                     ? "Tüm Kullanıcılar"
                     : a.audience === "all_workers"
                     ? "Tüm Workerlar"
                     : a.audience === "all_owners"
                     ? "Tüm Organization Owners"
                     : "Belirli Kullanıcılar"}
                </td>
                <td className="px-3 py-2">
                  {a.status === "published" ? (
                    <span className="text-green-700 font-medium">Yayında</span>
                  ) : (
                    <span className="text-yellow-700 font-medium">Taslak</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {a.status === "draft" ? (
                      <form action={publishAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="px-2 py-1.5 rounded border hover:bg-gray-50" type="submit">
                          Yayınla
                        </button>
                      </form>
                    ) : (
                      <>
                        <form action={unpublishAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="px-2 py-1.5 rounded border hover:bg-gray-50" type="submit">
                            Yayından Kaldır
                          </button>
                        </form>
                        <form action={deleteAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <button
                            className="px-2 py-1.5 rounded border text-red-700 hover:bg-red-50"
                            type="submit"
                          >
                            Sil
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={7}>
                  Henüz duyuru yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
