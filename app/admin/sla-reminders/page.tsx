'use client';

import { useEffect, useState, FormEvent } from "react";

type Rule = {
  id: string;
  name: string | null;
  tenant_id: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  minutes_before_sla: number;
  send_to_assignee: boolean;
  send_to_admins: boolean;
  allowed_question_statuses: string[];
  allowed_answer_statuses: string[];
  include_null_answer_status: boolean;
  subject_template: string;
  body_template: string;
};

type Tenant = {
  id: string;
  primary_domain: string | null;
};

type ApiListResponse =
  | { ok: true; rules: Rule[]; tenants: Tenant[] }
  | { ok: false; error: string };

const QUESTION_STATUSES = ["submitted", "approved", "rejected", "paid"] as const;
const ANSWER_STATUSES = ["drafting", "in_review", "sent", "completed", "reopened"] as const;

const DEFAULT_SUBJECT = "SLA hatırlatma – {{minutes}} dakika kala";
const DEFAULT_BODY = [
  "Merhaba,",
  "",
  "“{{title}}” başlıklı soru için SLA süresinin dolmasına yaklaşık {{minutes}} dakika kaldı.",
  "",
  "Çalışan ekranı: {{workerUrl}}",
  "Admin ekranı: {{adminUrl}}",
  "",
  "İyi çalışmalar"
].join("\n");

export default function AdminSlaRemindersPage() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state (yeni kural)
  const [ruleName, setRuleName] = useState<string>("");
  const [tenantId, setTenantId] = useState<string>("");
  const [minutesBefore, setMinutesBefore] = useState<number>(720); // varsayılan 12 saat
  const [sendToAssignee, setSendToAssignee] = useState(true);
  const [sendToAdmins, setSendToAdmins] = useState(true);
  const [questionStatuses, setQuestionStatuses] = useState<string[]>(["approved"]);
  const [answerStatuses, setAnswerStatuses] = useState<string[]>([
    "drafting",
    "in_review",
    "sent",
    "reopened",
  ]);
  const [includeNullAnswerStatus, setIncludeNullAnswerStatus] = useState(true);
  const [subjectTemplate, setSubjectTemplate] = useState(DEFAULT_SUBJECT);
  const [bodyTemplate, setBodyTemplate] = useState(DEFAULT_BODY);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/sla-rules", { cache: "no-store" });
        const data = (await res.json()) as ApiListResponse;
        if (!cancelled) {
          if ("ok" in data && data.ok) {
            setRules(data.rules);
            setTenants(data.tenants || []);
          } else {
            setError((data as any).error || "Kurallar yüklenirken hata oluştu.");
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Kurallar yüklenirken hata oluştu.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleQuestionStatus(v: string) {
    setQuestionStatuses((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  }
  function toggleAnswerStatus(v: string) {
    setAnswerStatuses((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  }

  function tenantLabel(id: string | null) {
    if (!id) return "Tüm tenantlar";
    const t = tenants.find((x) => x.id === id);
    if (!t) return id;
    if (t.primary_domain) return t.primary_domain;
    return id;
  }

  async function refreshRules() {
    try {
      const res = await fetch("/api/admin/sla-rules", { cache: "no-store" });
      const data = (await res.json()) as ApiListResponse;
      if ("ok" in data && data.ok) {
        setRules(data.rules);
        setTenants(data.tenants || []);
      } else {
        setError((data as any).error || "Kurallar yenilenirken hata oluştu.");
      }
    } catch (e: any) {
      setError(e?.message || "Kurallar yenilenirken hata oluştu.");
    }
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        name: ruleName || "",
        tenant_id: tenantId || null,
        minutes_before_sla: minutesBefore,
        send_to_assignee: sendToAssignee,
        send_to_admins: sendToAdmins,
        allowed_question_statuses: questionStatuses,
        allowed_answer_statuses: answerStatuses,
        include_null_answer_status: includeNullAnswerStatus,
        subject_template: subjectTemplate || DEFAULT_SUBJECT,
        body_template: bodyTemplate || DEFAULT_BODY,
        is_active: isActive,
      };
      const res = await fetch("/api/admin/sla-rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kural kaydedilemedi.");
      }
      setSuccess("Kural kaydedildi.");
      // formu resetle
      setRuleName("");
      setTenantId("");
      setMinutesBefore(720);
      setSendToAssignee(true);
      setSendToAdmins(true);
      setQuestionStatuses(["approved"]);
      setAnswerStatuses(["drafting", "in_review", "sent", "reopened"]);
      setIncludeNullAnswerStatus(true);
      setSubjectTemplate(DEFAULT_SUBJECT);
      setBodyTemplate(DEFAULT_BODY);
      setIsActive(true);
      // listeyi yenile
      await refreshRules();
    } catch (e: any) {
      setError(e?.message || "Kural kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(rule: Rule) {
    if (!confirm("Bu kuralı silmek istediğinizden emin misiniz?")) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/sla-rules?id=${encodeURIComponent(rule.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Kural silinemedi.");
      }
      setSuccess("Kural silindi.");
      setRules((prev) => (prev || []).filter((r) => r.id !== rule.id));
    } catch (e: any) {
      setError(e?.message || "Kural silinemedi.");
    }
  }

  async function handleToggleActive(rule: Rule) {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/sla-rules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Durum güncellenemedi.");
      }
      setRules((prev) =>
        (prev || []).map((r) =>
          r.id === rule.id ? { ...r, is_active: !rule.is_active } : r
        )
      );
    } catch (e: any) {
      setError(e?.message || "Durum güncellenemedi.");
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold">SLA hatırlatma kuralları</h1>
          <p className="text-sm text-gray-500">
            SLA süresi yaklaşan sorular için, tenant bazında ve farklı status filtreleriyle e-posta
            hatırlatmaları tanımlayabilirsiniz.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-700">Kaydedilen kurallar</h2>
          <button
            type="button"
            onClick={refreshRules}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Yenile
          </button>
        </div>
        {loading ? (
          <div className="text-sm text-gray-500">Yükleniyor…</div>
        ) : !rules || rules.length === 0 ? (
          <div className="text-sm text-gray-500">Henüz tanımlı kural yok.</div>
        ) : (
          <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-semibold text-gray-500">
                  <th className="px-3 py-2">Adı</th>
                  <th className="px-3 py-2">Tenant</th>
                  <th className="px-3 py-2">Aktif</th>
                  <th className="px-3 py-2">Süre (dk)</th>
                  <th className="px-3 py-2">Status filtre</th>
                  <th className="px-3 py-2">Answer status filtre</th>
                  <th className="px-3 py-2">Alıcılar</th>
                  <th className="px-3 py-2">Konu</th>
                  <th className="px-3 py-2 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {rules!.map((rule) => (
                  <tr key={rule.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 align-top">
                      <div className="max-w-[160px] truncate font-medium">
                        {rule.name || "(adsız)"}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        ID: {rule.id.slice(0, 8)}…
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                        {tenantLabel(rule.tenant_id)}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(rule)}
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          (rule.is_active
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border border-gray-200 bg-gray-50 text-gray-500")
                        }
                      >
                        {rule.is_active ? "De-aktif et" : "Aktif et"}
                      </button>
                    </td>
                    <td className="px-3 py-2 align-top">{rule.minutes_before_sla}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {rule.allowed_question_statuses?.map((s) => (
                          <span
                            key={s}
                            className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap items-center gap-1">
                        {rule.include_null_answer_status && (
                          <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
                            (boş)
                          </span>
                        )}
                        {rule.allowed_answer_statuses?.map((s) => (
                          <span
                            key={s}
                            className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {rule.send_to_assignee && (
                          <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                            Atanan danışman
                          </span>
                        )}
                        {rule.send_to_admins && (
                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                            Admin e-postaları
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top max-w-xs truncate">
                      {rule.subject_template}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(rule)}
                        className="inline-flex items-center rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Yeni kural oluştur</h2>
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Kural adı
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="Örn: Gümrük360 – SLA 12 saat kala"
              />
              <p className="text-xs text-gray-400">
                Listelemede göreceğiniz isim. E-posta konusu ayrıca aşağıda tanımlanır.
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Tenant
              </label>
              <select
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
              >
                <option value="">Tüm tenantlar için geçerli</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.primary_domain || t.id}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400">
                Belirli bir tenant seçerseniz, sadece o tenant&apos;a ait sorular için bu kural
                çalışır.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                SLA&apos;ya ne kadar kala?
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm"
                  value={minutesBefore}
                  onChange={(e) =>
                    setMinutesBefore(parseInt(e.target.value || "0", 10) || 0)
                  }
                />
                <span className="text-sm text-gray-500">dakika</span>
              </div>
              <p className="text-xs text-gray-400">
                Örneğin 720 dakika = 12 saat, 360 dakika = 6 saat.
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Kural durumu
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Aktif (cron çalıştığında bu kural kullanılacak)
              </label>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Soru status filtreleri
              </label>
              <div className="flex flex-wrap gap-2">
                {QUESTION_STATUSES.map((s) => (
                  <label
                    key={s}
                    className="inline-flex items-center gap-1 text-xs text-gray-700"
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-gray-300"
                      checked={questionStatuses.includes(s)}
                      onChange={() => toggleQuestionStatus(s)}
                    />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                Yalnızca işaretli status değerlerine sahip sorular için hatırlatma gönderilir.
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Answer status filtreleri
              </label>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-1 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-gray-300"
                    checked={includeNullAnswerStatus}
                    onChange={(e) => setIncludeNullAnswerStatus(e.target.checked)}
                  />
                  <span>Boş (NULL) olanlar</span>
                </label>
                {ANSWER_STATUSES.map((s) => (
                  <label
                    key={s}
                    className="inline-flex items-center gap-1 text-xs text-gray-700"
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-gray-300"
                      checked={answerStatuses.includes(s)}
                      onChange={() => toggleAnswerStatus(s)}
                    />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                Boş (NULL) seçiliyse, answer_status doldurulmamış sorular da dahildir.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Kime gönderilsin?
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={sendToAssignee}
                  onChange={(e) => setSendToAssignee(e.target.checked)}
                />
                <span>Atanan danışman</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={sendToAdmins}
                  onChange={(e) => setSendToAdmins(e.target.checked)}
                />
                <span>Admin e-postaları (ENV)</span>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              E-posta konusu
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={subjectTemplate}
              onChange={(e) => setSubjectTemplate(e.target.value)}
              placeholder={DEFAULT_SUBJECT}
            />
            <p className="text-xs text-gray-400">
              Kullanılabilir değişkenler: {"{{minutes}}"}, {"{{title}}"}.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              E-posta gövdesi
            </label>
            <textarea
              className="h-40 w-full rounded-md border border-gray-300 px-2 py-1 text-sm font-mono"
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
            />
            <p className="text-xs text-gray-400">
              Kullanılabilir değişkenler: {"{{title}}"}, {"{{minutes}}"}, {"{{slaDueAt}}"},
              {" {{workerUrl}}"}, {"{{adminUrl}}"}, {"{{role}}"}.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3">
<button
  type="submit"
  disabled={saving}
  className="inline-flex items-center justify-center rounded-lg border border-indigo-600 bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 hover:border-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
>
  {saving ? "Kaydediliyor…" : "Kuralı kaydet"}
</button>
          </div>
        </form>
      </section>
    </div>
  );
}
