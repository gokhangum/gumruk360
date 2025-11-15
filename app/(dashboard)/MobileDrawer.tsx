"use client";
import { useState } from "react";
import Link from "next/link";

type T = {
  dashwellcome: string;
  dashlogin: string;
  dashsignup: string;
  homepage: string;
  howItWorks: string;
  ask: string;
  myQuestions: string;
  myPayments: string;
  subscriptionManagement: string;
  creditManagement: string;
  announcements: string;
  contact: string;
  support: string;
  profile: string;
  kvkkGdpr: string;
  terms: string;
  cookies: string;
  logout: string;
};

export default function MobileDrawer({
  displayName,
  t,
  howItWorksHref,
  emailQuery,
  showSubscription
}: {
  displayName: string | null;
  t: T;
  howItWorksHref: string;
  emailQuery: string;
  showSubscription: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isAuth = !!displayName;
  const loginLabel = t.dashlogin;
  const signupLabel = t.dashsignup;
  const welcomeText = displayName ? `${t.dashwellcome} ${displayName}` : "";
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
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer */}
      {open && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-label="Dashboard menu"
          className="fixed top-[56px] left-0 right-0 z-50 md:hidden border-t border-black/10 px-4 pb-4 bg-white text-slate-900 max-h-[70vh] overflow-y-auto"
        >
          <div className="grid gap-2 py-2 text-sm">
            {/* Auth & Quick actions */}
            {isAuth ? (
              <div className="flex items-center justify-between py-2">
                <div className="text-sm font-medium">{welcomeText}</div>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center rounded border border-slate-300 px-3 py-2"
                >
                  {t.logout}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link href="/login" className="inline-flex justify-center rounded border border-slate-300 px-4 py-2" onClick={() => setOpen(false)}>
                  {loginLabel}
                </Link>
                <Link href="/signup" className="inline-flex justify-center rounded border border-slate-300 px-4 py-2" onClick={() => setOpen(false)}>
                  {signupLabel}
                </Link>
              </div>
            )}

            <Link
              href="/ask"
              className="inline-flex justify-center rounded-full text-white px-4 py-2"
              style={{ backgroundColor: NAV_BG }}
              onClick={() => setOpen(false)}
            >
              {t.ask}
            </Link>

            <div className="h-px bg-slate-200 my-2" />

            <Link href="/" className="py-2 block" onClick={() => setOpen(false)}>
              {t.homepage}
            </Link>

            <div className="bg-slate-100 rounded px-3 pt-2 pb-3 mt-1">
              <div className="text-xs text-slate-500 mb-1">
                {t.howItWorks}
              </div>
              <Link href={howItWorksHref} className="py-1 block" onClick={() => setOpen(false)}>
                {t.howItWorks}
              </Link>
            </div>

            {/* Dashboard links */}
            <Link href="/dashboard/questions" className="py-2 block" onClick={() => setOpen(false)}>{t.myQuestions}</Link>
            <Link href="/dashboard/orders" className="py-2 block" onClick={() => setOpen(false)}>{t.myPayments}</Link>
            {showSubscription ? (
              <Link href="/dashboard/subscription" className="py-2 block" onClick={() => setOpen(false)}>{t.subscriptionManagement}</Link>
            ) : (
              <Link href={`/dashboard/credits${emailQuery}`} className="py-2 block" onClick={() => setOpen(false)}>{t.creditManagement}</Link>
            )}
            <Link href="/dashboard/announcements" className="py-2 block" onClick={() => setOpen(false)}>{t.announcements}</Link>
            <Link href="/dashboard/contact" className="py-2 block" onClick={() => setOpen(false)}>{t.contact}</Link>
            <Link href="/dashboard/support" className="py-2 block" onClick={() => setOpen(false)}>{t.support}</Link>
            <Link href="/dashboard/profile" className="py-2 block" onClick={() => setOpen(false)}>{t.profile}</Link>

            <div className="bg-slate-100 rounded px-3 pt-2 pb-3 mt-1">
              <div className="text-xs text-slate-500 mb-1">
                Yasal
              </div>
              <Link href="/dashboard/kvkk-gdpr" className="py-1 block" onClick={() => setOpen(false)}>{t.kvkkGdpr}</Link>
              <Link href="/dashboard/terms" className="py-1 block" onClick={() => setOpen(false)}>{t.terms}</Link>
              <Link href="/dashboard/cookies" className="py-1 block" onClick={() => setOpen(false)}>{t.cookies}</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
