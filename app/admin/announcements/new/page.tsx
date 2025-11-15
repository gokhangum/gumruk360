import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { supabaseServer } from "../../../../lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

async function createAnnouncement(formData: FormData) {
  "use server"

  const a = admin()
  const s = await supabaseServer()

  // Oturumdaki admin id
  const { data: userRes, error: userErr } = await s.auth.getUser()
  if (userErr || !userRes?.user?.id) {
    throw new Error("Oturum bulunamadı. Lütfen admin olarak giriş yapın.")
  }
  const adminId = userRes.user.id

  const type = String(formData.get("type") || "notice")
  const lang = String(formData.get("lang") || "tr")
  const title = String(formData.get("title") || "")
  const body = String(formData.get("body") || "")
   const audience = String(formData.get("audience") || "all_users") as
     | "all_users" | "all_workers" | "all_owners" | "specific"

  const specificEmailsRaw = String(formData.get("specificEmails") || "").trim()
  const files = formData.getAll("attachments") as File[]
   const tenantIdRaw = String(formData.get("tenant_id") || "").trim()
   const tenant_id = tenantIdRaw ? tenantIdRaw : null
  if (!title || !body) throw new Error("Başlık ve içerik zorunlu")

  // 1) Insert announcement (draft)
  const { data: ins, error: insErr } = await a
    .from("announcements")
    .insert({ type, lang, title, body, audience, tenant_id, status: "draft", created_by: adminId })
    .select("*")
    .single()
  if (insErr || !ins) throw new Error("Insert hatası: " + (insErr?.message ?? "bilinmiyor"))

  const announcementId = ins.id as string

  // 2) audience='specific' → email→user_id eşle
  if (audience === "specific" && specificEmailsRaw) {
    const emails = specificEmailsRaw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)

    if (emails.length > 0) {
      const { data: profs, error: pErr } = await a
        .from("profiles")
        .select("id,email")
        .in("email", emails)
      if (pErr) throw new Error("Profil sorgu hatası: " + pErr.message)

      const targets = (profs || []).map((p: any) => ({
        announcement_id: announcementId,
        user_id: p.id,
      }))
            if (targets.length > 0) {
        const { error: tErr } = await a
          .from("announcement_targets")
          .insert(targets)
        if (tErr) throw new Error("Hedef ekleme hatası: " + tErr.message)
      }

    }
  }

  // 3) Ek yükleme (storage + meta)
  if (files && files.length > 0) {
    for (const file of files) {
      if (!file || typeof file.arrayBuffer !== "function") continue
      const buf = Buffer.from(await file.arrayBuffer())
      const ext = (file.name.split(".").pop() || "bin").toLowerCase()
      const key = `attachments/announcements/${announcementId}/${crypto.randomUUID()}.${ext}`

      const upload = await s.storage
        .from("attachments")
        .upload(key, buf, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })
      if (upload.error) throw new Error("Upload hatası: " + upload.error.message)

      const { error: metaErr } = await a.from("announcement_attachments").insert({
        announcement_id: announcementId,
        object_path: key,
        file_name: file.name,
        mime: file.type,
        size: (file as any).size ?? null,
        uploaded_by: adminId,
      })
      if (metaErr) throw new Error("Ek meta insert hatası: " + metaErr.message)
    }
  }

  revalidatePath("/admin/announcements")
  redirect("/admin/announcements")
}

export default async function NewAnnouncementPage() {
   const s = await supabaseServer()
   const { data: tenants } = await s
     .from("tenants")
     .select("id, code, primary_domain")
     .order("code", { ascending: true })
  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-4">Yeni Duyuru</h1>

      {/* NOT: Server action ile birlikte encType/method belirtmiyoruz */}
      <form action={createAnnouncement} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm mb-1">Tür</label>
            <select name="type" className="w-full border rounded px-3 py-2">
              <option value="notice">Bildirim</option>
              <option value="news">Haber</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">Dil</label>
            <select name="lang" className="w-full border rounded px-3 py-2">
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">Hedef</label>
            <select name="audience" className="w-full border rounded px-3 py-2" defaultValue="all_users">
              <option value="all_users">Tüm Kullanıcılar</option>
              <option value="all_workers">Tüm Workerlar</option>
			  <option value="all_owners">Tüm Organization Owners</option>
              <option value="specific">Belirli Kullanıcılar</option>
            </select>
          </div>
          <div>
           <label className="block text-sm mb-1">Tenant (opsiyonel)</label>
<select name="tenant_id" className="w-full border rounded px-3 py-2">
              <option value="">Tümü (tenant filtresi yok)</option>
              {(tenants || []).map((t: any) => (
               <option key={t.id} value={t.id}>
                {t.code} ({t.primary_domain || "—"})
               </option>
              ))}
           </select>

          </div>

        </div>

        <div>
          <label className="block text-sm mb-1">Başlık</label>
          <input name="title" className="w-full border rounded px-3 py-2" placeholder="Başlık" required />
        </div>

        <div>
          <label className="block text-sm mb-1">İçerik (HTML serbest)</label>
          <textarea
            name="body"
            className="w-full border rounded px-3 py-2 min-h-[160px]"
            placeholder="<p>Metin...</p>"
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Belirli kullanıcılara (opsiyonel)</label>
          <input
            name="specificEmails"
            className="w-full border rounded px-3 py-2"
            placeholder="E-postaları virgülle ayır: a@x.com, b@y.com"
          />
          <p className="text-xs text-gray-500 mt-1">
            Sadece &quot;Hedef&quot; alanında &quot;Belirli Kullanıcılar&quot; seçildiğinde dikkate alınır.
          </p>
        </div>

        <div>
          <label className="block text-sm mb-1">Ek Yükle</label>
          <input name="attachments" type="file" multiple className="w-full" />
        </div>

        <div className="flex gap-2">
          <button className="px-4 py-2 rounded bg-black text-white hover:opacity-90" type="submit">
            Kaydet (Taslak)
          </button>
          <a href="/admin/announcements" className="px-4 py-2 rounded border hover:bg-gray-50">
            İptal
          </a>
        </div>
      </form>
    </div>
  )
}
