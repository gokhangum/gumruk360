"use client";
import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import ActiveLink from "@/components/nav/ActiveLink";
import { createClient } from "@supabase/supabase-js";
import { tenantFromHost } from "@/lib/brand";
const NAV_BG = "#1159BF";
const NAV_FG = "#FFFFFF";

type Props = { userName?: string; isAuth?: boolean };

export default function Header({ userName, isAuth }: Props) {
  const [open, setOpen] = useState(false);
  const tHome = useTranslations("marketing.home");
  const tGlobal = useTranslations("marketing");
  
useEffect(() => {
  if (!open) return;
  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
  document.addEventListener("keydown", onKey);

  return () => {
    document.body.style.overflow = prev;
    document.removeEventListener("keydown", onKey);
  };
}, [open]);

  // Header logo (white) – tenant'a göre
  const [headerLogo, setHeaderLogo] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
   const tenant = tenantFromHost(host);
    const logo =
     tenant === "EN"
       ? "/brand/easycustoms360wh-opt.svg"
       : "/brand/gumruk360wh-opt.svg";
    setHeaderLogo(logo);
   }, []);

  const tf = (key: string, fallback: string) => {
    try { return tHome(key) as unknown as string; } catch { return fallback; }
   };


  const signupLabel = tf("nav.signup", "Üye Olun");
  const loginLabel = tf("nav.login", "Giriş Yap");
const welcomeText = tHome("nav.welcome", { name: userName || tHome("nav.accountFallback") });
  const supabase = useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
    );
   }, []);

   // === Rol & CTA (varsayılan: misafir) ===
const [role, setRole] = useState<string>(isAuth ? "user" : "guest");
const [ctaHref, setCtaHref] = useState<string>("/ask");
const [ctaLabel, setCtaLabel] = useState<string>(tf("nav.ask", "Soru Sor"));


useEffect(() => {
  let mounted = true;

  const applyRole = (r: string) => {
    if (!mounted) return;
    setRole(r);
    if (r === "admin") {
      setCtaHref("/admin");
      setCtaLabel(tf("Dashboard", "Kullanıcı Paneli"));
    } else if (r === "worker" || r === "worker360") {
      setCtaHref("/worker");
      setCtaLabel(tf("Dashboard", "Kullanıcı Paneli"));
    } else {
      setCtaHref("/ask");
      setCtaLabel(tf("Dashboard", "Kullanıcı Paneli"));
    }
  };

  const fetchRole = async () => {
    try {
      const res = await fetch("/api/me/role", { credentials: "include" });
      if (!res.ok) return; // mevcut CTA kalsın
      const json = await res.json();
      const r = json?.role || "user";
      applyRole(r);
    } catch {
      // sessizce geç; mevcut CTA kalsın
    }
  };

  // İlk yüklemede
  fetchRole();

  // Oturum sonradan hazır olursa tekrar dene
  const { data: sub } = supabase.auth.onAuthStateChange(() => {
    fetchRole();
  });

  return () => {
    mounted = false;
    sub.subscription?.unsubscribe?.();
  };
}, [supabase, tf]);




 const handleLogout = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      window.location.reload();
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-black/10" style={{ backgroundColor: NAV_BG }}>
      <div className="h-16 px-4 md:px-8 flex items-center justify-between" style={{ color: NAV_FG }}>
        {/* Left: Logo + Primary Nav */}
        <div className="flex items-center gap-6 min-w-0">
       <Link href="/" className="whitespace-nowrap" style={{ color: NAV_FG }} aria-label={tGlobal("brandName")}>
 {headerLogo ? (
    <img
      src={headerLogo}
      alt={tGlobal("brandName")}
      className="h-8 sm:h-10 w-auto max-w-[70vw] sm:max-w-none block"
   />
  ) : (
    <span className="font-semibold text-lg tracking-tight">{tGlobal("brandName")}</span>
  )}
</Link>


          <nav className="topnav hidden xl:flex items-center gap-6 text-sm">
<ActiveLink href="/" variant="topnav">{tf("nav.home", "Ana Sayfa")}</ActiveLink>
            {/* How it works dropdown */}
            <div className="relative group">
<ActiveLink
  href="/how-it-works"
  startsWith
  variant="topnav"
  className="inline-flex items-center gap-1"
  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
>
  {tf("nav.howitworks", "Nasıl Çalışır")}
  <ChevronDown className="h-4 w-4 opacity-80" />
</ActiveLink>
              <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-150 absolute left-0 top-full w-56 rounded-xl bg-white text-slate-900 shadow-lg ring-1 ring-black/5">
                <div className="py-2 text-sm">
                  <Link href="/how-it-works/individual" className="block px-4 py-2 hover:bg-slate-50 rounded">
                    {tf("nav.howitworks_individual", "Bireysel Kullanıcılar")}
                  </Link>
                  <Link href="/how-it-works/corporate" className="block px-4 py-2 hover:bg-slate-50 rounded">
                    {tf("nav.howitworks_corporate", "Kurumsal Kullanıcılar")}
                  </Link>
                </div>
              </div>
            </div>
<ActiveLink href="/news" variant="topnav">{tf("nav.hbrdyr", "Haberler&Duyurular")}</ActiveLink>
<ActiveLink href="/blog" variant="topnav">{tf("nav.blog", "Blog")}</ActiveLink>
<ActiveLink href="/contact" variant="topnav">{tf("nav.contact", "İletişim")}</ActiveLink>
<ActiveLink href="/about" variant="topnav">{tf("nav.about", "Hakkımızda")}</ActiveLink>
            {/* Legal dropdown */}
            <div className="relative group">
<ActiveLink
  href="/legal"
  startsWith
  variant="topnav"
  className="inline-flex items-center gap-1"
  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
>
  {tf("nav.legal", "Yasal")}
  <ChevronDown className="h-4 w-4 opacity-80" />
</ActiveLink>
              <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-150 absolute left-0 top-full w-56 rounded-xl bg-white text-slate-900 shadow-lg ring-1 ring-black/5">
                <div className="py-2 text-sm">
                  <Link href="/legal/privacy" className="block px-4 py-2 hover:bg-slate-50 rounded">
                    {tf("nav.legal_privacy", "Gizlilik / KVKK")}
                  </Link>
                  <Link href="/legal/terms" className="block px-4 py-2 hover:bg-slate-50 rounded">
                    {tf("nav.legal_terms", "Kullanım Koşulları")}
                  </Link>
                  <Link href="/legal/cookies" className="block px-4 py-2 hover:bg-slate-50 rounded">
                    {tf("nav.legal_cookies", "Çerez Politikası")}
                  </Link>
                </div>
              </div>
            </div>
          </nav>
        </div>

        {/* Right: Actions */}
        <div className="hidden xl:flex items-center gap-3">
        {isAuth ? (
  <div className="flex items-center gap-2">
<span className="text-sm font-medium text-white/90">
  {welcomeText}
</span>
    <button
      onClick={handleLogout}
      className="px-3 py-2 rounded-full border border-white/80 text-white hover:bg-white/10 text-sm font-medium"
     aria-label={tf("nav.logout", "Çıkış")}
    >
      {tf("nav.logout", "Çıkış")}
    </button>
  </div>
) : (
  <>
    <Link
      href="/login"
      className="px-4 py-2 rounded-full border border-white/80 text-white hover:bg-white/10 text-sm font-medium"
    >
      {loginLabel}
    </Link>
    <Link
      href="/signup"
      className="px-4 py-2 rounded-full border border-white/80 text-white hover:bg-white/10 text-sm font-medium"
    >
      {signupLabel}
    </Link>
  </>
)}



         <Link
             href={ctaHref}
             className="px-4 py-2 rounded-full bg-white text-sm font-medium hover:opacity-90 whitespace-nowrap"
             style={{ color: NAV_BG }}
          >
           {ctaLabel}
          </Link>
        </div>

    
     {/* Mobile */}
 <button
  aria-label="Open menu"
  className="xl:hidden min-h-[44px] p-2 rounded hover:bg-white/10 text-white"
  aria-expanded={open}
  aria-controls="mobile-menu"
  onClick={() => setOpen(v => !v)}
>
  <Menu className="h-5 w-5" />
</button>


      </div>

     {/* Overlay */}
{open && (
  <div
    className="fixed inset-0 z-40 bg-black/40 xl:hidden"
    onClick={() => setOpen(false)}
    aria-hidden="true"
  />
)}

{/* Mobile Drawer */}
{open && (
  <div
    id="mobile-menu"
    role="dialog"
    aria-label={tf("nav.menu", "Ana menü")}
    className="fixed top-[56px] left-0 right-0 z-50 xl:hidden border-t border-black/10 px-4 pb-4 bg-white text-slate-900 max-h-[70vh] overflow-y-auto"
  >
   <div className="grid gap-2 py-2 text-sm">

      {/* Auth & Quick actions (moved to top) */}
      {isAuth ? (
        <div className="flex items-center justify-between py-2">
          <div className="text-sm font-medium">{welcomeText}</div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center rounded border border-slate-300 px-3 py-2"
          >
            Çıkış
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
        href={ctaHref}
        className="inline-flex justify-center rounded-full text-white px-4 py-2 whitespace-nowrap"
        style={{ backgroundColor: NAV_BG }}
        onClick={() => setOpen(false)}
      >
        {ctaLabel}
      </Link>

      <div className="h-px bg-slate-200 my-2" />


       <Link href="/" className="py-2 block" onClick={() => setOpen(false)} autoFocus>
         {tf("nav.home", "Ana Sayfa")}
       </Link>

     <div className="bg-slate-100 rounded px-3 pt-2 pb-3 mt-1">

        <div className="text-xs text-slate-500 mb-1">
          {tf("nav.howitworks", "Nasıl Çalışır")}
        </div>
        <Link href="/how-it-works/individual" className="py-1 block" onClick={() => setOpen(false)}>
          {tf("nav.howitworks_individual", "Bireysel Kullanıcılar")}
        </Link>
        <Link href="/how-it-works/corporate" className="py-1 block" onClick={() => setOpen(false)}>
          {tf("nav.howitworks_corporate", "Kurumsal Kullanıcılar")}
        </Link>
      </div>

      <Link href="/news" className="py-2 block" onClick={() => setOpen(false)}>{tf("nav.hbrdyr", "Haberler&Duyurular")}</Link>
      <Link href="/blog" className="py-2 block" onClick={() => setOpen(false)}>{tf("nav.blog", "Blog")}</Link>
      <Link href="/contact" className="py-2 block" onClick={() => setOpen(false)}>{tf("nav.contact", "İletişim")}</Link>
      <Link href="/about" className="py-2 block" onClick={() => setOpen(false)}>{tf("nav.about", "Hakkımızda")}</Link>

      <div className="bg-slate-100 rounded px-3 pt-2 pb-3 mt-1">
        <div className="text-xs text-slate-500 mb-1">
          {tf("nav.legal", "Yasal")}
        </div>
        <Link href="/legal/privacy" className="py-1 block" onClick={() => setOpen(false)}>
          {tf("nav.legal_privacy", "Gizlilik / KVKK")}
        </Link>
        <Link href="/legal/terms" className="py-1 block" onClick={() => setOpen(false)}>
          {tf("nav.legal_terms", "Kullanım Koşulları")}
        </Link>
        <Link href="/legal/cookies" className="py-1 block" onClick={() => setOpen(false)}>
          {tf("nav.legal_cookies", "Çerez Politikası")}
        </Link>
      </div>   
    </div>
  </div>
)}

    </header>
  );
}
