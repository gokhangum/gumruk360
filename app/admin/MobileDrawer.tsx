// app/admin/MobileDrawer.tsx
"use client";

import { useState } from "react";
import Link from "next/link";

export default function AdminMobileDrawer() {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <>
      {/* Trigger button (sadece mobil) */}
      <button
        aria-label="Admin menü"
        title="Admin menü"
        className="md:hidden inline-flex items-center justify-center rounded-lg border border-black/20 bg-white text-slate-900 shadow-sm px-2.5 py-2"
        aria-expanded={open}
        aria-controls="admin-mobile-menu"
        onClick={() => setOpen(v => !v)}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6">
          <path
            d="M3 6h18M3 12h18M3 18h18"
            stroke="currentColor"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      {open && (
        <div
          id="admin-mobile-menu"
          role="dialog"
          aria-label="Admin menü"
          className="fixed top-[56px] left-0 right-0 z-50 md:hidden"
        >
          <div className="mx-3 rounded-xl border border-slate-200 bg-white text-slate-900 shadow-lg max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div className="text-sm font-semibold">Admin menü</div>
              <button
                onClick={close}
                aria-label="Menüyü kapat"
                className="p-1 rounded-full hover:bg-slate-100"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth={2}
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="px-4 pb-4 pt-2 text-sm space-y-1">
              <Link href="/admin/requests" className="block py-2" onClick={close}>
                Talepler
              </Link>
              <Link href="/admin/assignment-requests" className="block py-2" onClick={close}>
                Atama talepleri
              </Link>
              <Link href="/admin/users" className="block py-2" onClick={close}>
                Kullanıcılar
              </Link>
              <Link href="/admin/payments" className="block py-2" onClick={close}>
                Ödemeler
              </Link>
              <Link href="/admin/stats" className="block py-2" onClick={close}>
                İstatistikler
              </Link>
              <Link href="/admin/announcements" className="block py-2" onClick={close}>
                Bildirim &amp; Haber
              </Link>
              <Link href="/admin/contact" className="block py-2" onClick={close}>
                Mesaj Kutusu
              </Link>
              <Link href="/admin/blog/review" className="block py-2" onClick={close}>
                Blog
              </Link>
              <Link href="/admin/news" className="block py-2" onClick={close}>
                Haber &amp; Duyuru
              </Link>
              <Link href="/admin/gpt-modulu" className="block py-2" onClick={close}>
                GPT Modülü
              </Link>
              <Link href="/admin/taslak-modulu" className="block py-2" onClick={close}>
                Taslak Modülü
              </Link>
              <Link href="/admin/dokuman-yukleme" className="block py-2" onClick={close}>
                RAG Döküman Yükleme
              </Link>
              <Link href="/admin/settings" className="block py-2" onClick={close}>
                Ayarlar
              </Link>
              <Link href="/admin/subscription-settings" className="block py-2" onClick={close}>
                Abonelik Ayarları
              </Link>
              <Link href="/admin/fx-payments" className="block py-2" onClick={close}>
                FX Ödeme Ayarları
              </Link>
              <Link href="/admin/gpt-precheck" className="block py-2" onClick={close}>
                GPT Precheck
              </Link>
              <Link href="/admin/logs" className="block py-2" onClick={close}>
                Log kayıtları
              </Link>
              <Link href="/admin/consultants" className="block py-2" onClick={close}>
                Danışmanlar
              </Link>
              <Link href="/admin/danisman-odeme-yonetimi" className="block py-2" onClick={close}>
                Danışman Ödeme Yönetimi
              </Link>
			                <Link href="/admin/sla-reminders" className="block py-2" onClick={close}>
                SLA Hatırlatıcı
              </Link>
              <Link href="/admin/seo" className="block py-2" onClick={close}>
                Tenant Seo
              </Link>

              <div className="h-px my-2 bg-slate-200" />

              <Link
                href="/admin/tools/bulk-delete-questions"
                className="block py-2"
                onClick={close}
              >
                Soru Silme
              </Link>
              <Link
                href="/admin/tools/cleanup-order-payments"
                className="block py-2"
                onClick={close}
              >
                Order Silme
              </Link>
              <Link
                href="/admin/tools/bulk-delete-payments"
                className="block py-2"
                onClick={close}
              >
                Payment Silme
              </Link>

              <div className="h-px my-2 bg-slate-200" />

              <a
                href="/logout"
                className="block py-2 text-red-600"
                onClick={close}
              >
                Çıkış
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
