// components/cookies/CookieBanner.tsx
// Additive: lightweight Consent banner with categories + localStorage persistence
'use client';
import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
type ConsentState = {
  necessary: boolean;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
};
type ConsentStatus = "unknown" | "accepted" | "rejected";
const STORAGE_KEY = "cookieConsent";

function readConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveConsent(c: ConsentState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}
function gtagUpdate(c: ConsentState) {
  const granted = (v: boolean) => (v ? "granted" : "denied");
  // analytics maps to analytics_storage, marketing maps to ad_* family
  (window as any).dataLayer = (window as any).dataLayer || [];
  function gtag(..._args: any[]){ (window as any).dataLayer.push(arguments as any); }
  gtag('consent', 'update', {
    analytics_storage: granted(c.analytics),
    ad_storage: granted(c.marketing),
    ad_user_data: granted(c.marketing),
    ad_personalization: granted(c.marketing),
  });
}

function defaultDenied(): ConsentState {
  return { necessary: true, preferences: false, analytics: false, marketing: false };
}
function deriveStatus(c: ConsentState | null): ConsentStatus {
  if (!c) return "unknown";
  const anyOptional = c.preferences || c.analytics || c.marketing;
  return anyOptional ? "accepted" : "rejected";
}
export default function CookieBanner() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [state, setState] = useState<ConsentState>(defaultDenied());
  const [status, setStatus] = useState<ConsentStatus>("unknown");

  useEffect(() => {
    const c = readConsent();
    const s = deriveStatus(c);
     setStatus(s);
 
     if (!c) {
       // consent_status = "unknown" -> her girişte banner açık
     setState(defaultDenied());
      setOpen(true);
    } else {
      setState(c);
      // Daha önce seçim yapılmışsa, GA/GTM için mevcut tercihi hemen uygula
      gtagUpdate(c);
     // accepted veya rejected ise banner kapalı başlasın
      setOpen(false);
   }
 }, []);



    const acceptAll = () => {
    const next = { necessary: true, preferences: true, analytics: true, marketing: true };
    saveConsent(next);
    gtagUpdate(next);
    setState(next);
    setStatus("accepted");
    setOpen(false);
  };

  const rejectAll = () => {
    const next = defaultDenied();
    saveConsent(next);
    gtagUpdate(next);
    setState(next);
    setStatus("rejected");
    setOpen(false);
  };

  const saveCustom = () => {
    const next = { ...state, necessary: true };
    saveConsent(next);
    gtagUpdate(next);
    setState(next);
    setStatus(deriveStatus(next));
    setOpen(false);
    setModal(false);
  };


 if (!open) {
    // consent_status = "accepted" veya "rejected" -> banner kapalı,
    // ama kullanıcı isterse buradan tekrar açabilsin
    return (
      <button
        type="button"
        className="fixed bottom-3 left-3 z-[900] rounded-full bg-slate-900/80 px-3 py-1 text-xs text-slate-50 shadow-lg hover:bg-slate-900"
        onClick={() => setOpen(true)}
      >
        {t('cookies.manageLabel') || 'Çerezler'}
      </button>
    );
  }


  return (
   <div className="fixed inset-x-0 bottom-0 z-[1000] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-[clamp(320px,92vw,1120px)] rounded-t-2xl border border-sky-200 bg-sky-50/80 backdrop-blur-xl p-4 md:p-5 shadow-2xl ring-1 ring-black/5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="text-sm md:max-w-[68%] text-slate-800">
            <strong>{t('cookies.banner.title') || 'Cookies'}</strong>
            <p className="text-slate-600">
              {t('cookies.banner.body') || 'We use cookies to improve your experience. You can accept, reject, or customize.'}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
           <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={rejectAll}>
              {t('cookies.actions.reject') || 'Reject'}
            </button>
           <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setModal(true)}>
              {t('cookies.actions.customize') || 'Customize'}
            </button>
            <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 shadow-sm" onClick={acceptAll}>
              {t('cookies.actions.accept') || 'Accept'}
            </button>
          </div>
        </div>

        {modal && (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/60 p-4 md:p-5">
           <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-slate-500">
               <input type="checkbox" checked disabled className="accent-emerald-600" />
                {t('cookies.categories.necessary') || 'Strictly Necessary'} (always on)
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="accent-emerald-600" checked={state.preferences} onChange={e => setState(s => ({ ...s, preferences: e.target.checked }))} />
                {t('cookies.categories.preferences') || 'Preferences'}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
               <input type="checkbox" className="accent-emerald-600" checked={state.analytics} onChange={e => setState(s => ({ ...s, analytics: e.target.checked }))} />
                {t('cookies.categories.analytics') || 'Analytics'}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="accent-emerald-600" checked={state.marketing} onChange={e => setState(s => ({ ...s, marketing: e.target.checked }))} />
                {t('cookies.categories.marketing') || 'Marketing'}
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setModal(false)}>
                {t('cookies.actions.cancel') || 'Cancel'}
              </button>
              <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 shadow-sm" onClick={saveCustom}>
                {t('cookies.actions.save') || 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
