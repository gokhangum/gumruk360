"use client";
import { useState } from "react";
import Link from "next/link";

type T = {
  homepage: string;
  assigned: string;
  done: string;
  contact: string;
  inbox: string;
  announcements: string;
  cvEdit: string;
  blog: string;
  profilePage: string;
  logout: string;
};

export default function MobileDrawer({
  displayName,
  t
}: {
  displayName?: string | null;
  t: T;
}) {
  const [open, setOpen] = useState(false);
  const NAV_BG = "#0a55b6";

  const handleLogout = () => {
    window.location.href = "/logout";
  };

  return (
    <>
      {/* Mobile trigger */}
      <button
        aria-label="Open menu" title="Menu"
        className="md:hidden inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-lg border border-black/20 bg-white text-slate-900 shadow-sm"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(v => !v)}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6">
          <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer (drop-down under header) */}
      {open && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-label="Worker menu"
          className="fixed top-[56px] left-0 right-0 z-50 md:hidden rounded-b-2xl border-t border-slate-200 px-4 pb-4 bg-white text-slate-900 max-h-[70vh] overflow-y-auto"
        >
          {/* Drawer Body */}
          <div className="px-0 py-3">
            <div className="grid gap-2 py-2 text-sm">
              {/* Welcome & Logout */}
              {displayName ? (
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm font-medium">Welcome, {displayName}</div>
                  <button
                    onClick={() => { setOpen(false); window.location.href = "/logout"; }}
                    className="inline-flex items-center rounded border border-slate-300 px-3 py-2"
                  >
                    {t.logout}
                  </button>
                </div>
              ) : null}

  

              {/* Worker links */}
			  <Link href="/" className="py-2 block" onClick={() => setOpen(false)}>{t.homepage}</Link>
              <Link href="/worker" className="py-2 block" onClick={() => setOpen(false)}>{t.assigned}</Link>
              <Link href="/worker/done" className="py-2 block" onClick={() => setOpen(false)}>{t.done}</Link>

              <div className="h-px my-1 bg-slate-200" />

              <Link href="/worker/contact" className="py-2 block" onClick={() => setOpen(false)}>{t.contact}</Link>
              <Link href="/worker/support" className="py-2 block" onClick={() => setOpen(false)}>{t.inbox}</Link>
              <Link href="/worker/announcements" className="py-2 block" onClick={() => setOpen(false)}>{t.announcements}</Link>

              <div className="h-px my-1 bg-slate-200" />

              <Link href="/worker/cv" className="py-2 block" onClick={() => setOpen(false)}>{t.cvEdit}</Link>
              <Link href="/worker/blog" className="py-2 block" onClick={() => setOpen(false)}>{t.blog}</Link>
              <Link href="/worker/profile" className="py-2 block" onClick={() => setOpen(false)}>{t.profilePage}</Link>
            </div>
          </div>
        </div>
      )}
    </>
    
  );
}
