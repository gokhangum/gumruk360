import Link from "next/link";
import ActiveLink from "@/components/nav/ActiveLink";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import PermissionWatcher from "./PermissionWatcher";
import { headers } from "next/headers";
import MobileDrawer from "./MobileDrawer";
import { tenantFromHost } from "@/lib/brand";
/** Inline transparent, stroke-only icons */
function I({ name, className = "h-4 w-4 opacity-70", strokeWidth = 1.5 }: { name: string; className?: string; strokeWidth?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (name) {
    case "LayoutDashboard":
      return (<svg className={className} viewBox="0 0 24 24"><rect {...common as any} x="3" y="3" width="7" height="7"/><rect {...common as any} x="14" y="3" width="7" height="5"/><rect {...common as any} x="14" y="10" width="7" height="11"/><rect {...common as any} x="3" y="12" width="7" height="9"/></svg>);
    case "Info":
      return (<svg className={className} viewBox="0 0 24 24"><circle {...common as any} cx="12" cy="12" r="10"/><line {...common as any} x1="12" y1="16" x2="12" y2="12"/><line {...common as any} x1="12" y1="8" x2="12" y2="8"/></svg>);
    case "HelpCircle":
    case "CircleHelp":
      return (<svg className={className} viewBox="0 0 24 24"><circle {...common as any} cx="12" cy="12" r="10"/><path {...common as any} d="M9.5 9a3 3 0 1 1 4.9 2.3c-.6.5-1 .9-1 1.7"/><line {...common as any} x1="12" y1="17" x2="12" y2="17"/></svg>);
    case "FileQuestion":
      return (<svg className={className} viewBox="0 0 24 24"><path {...common as any} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path {...common as any} d="M14 2v6h6"/><path {...common as any} d="M9.5 12a3 3 0 0 1 5 2.2c0 1.2-.9 1.8-2 2.3"/><line {...common as any} x1="12" y1="19" x2="12" y2="19"/></svg>);
    case "CreditCard":
      return (<svg className={className} viewBox="0 0 24 24"><rect {...common as any} x="2" y="5" width="20" height="14" rx="2"/><line {...common as any} x1="2" y1="9" x2="22" y2="9"/><line {...common as any} x1="6" y1="13" x2="10" y2="13"/></svg>);
    case "BadgeDollarSign":
      return (<svg className={className} viewBox="0 0 24 24"><circle {...common as any} cx="12" cy="12" r="9"/><path {...common as any} d="M15 9.5c0-1.4-1.4-2-3-2s-3 .6-3 2 1 2 3 2 3 .6 3 2-1.4 2-3 2-3-.6-3-2"/><line {...common as any} x1="12" y1="5" x2="12" y2="19"/></svg>);
    case "Coins":
      return (<svg className={className} viewBox="0 0 24 24"><ellipse {...common as any} cx="12" cy="6" rx="6" ry="3"/><path {...common as any} d="M6 6v6c0 1.7 2.7 3 6 3s6-1.3 6-3V6"/><path {...common as any} d="M6 12v6c0 1.7 2.7 3 6 3s6-1.3 6-3v-6"/></svg>);
    case "Megaphone":
      return (<svg className={className} viewBox="0 0 24 24"><path {...common as any} d="M3 11l12-5v12L3 13z"/><path {...common as any} d="M15 6h3a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-3"/><line {...common as any} x1="6" y1="13" x2="6" y2="19"/></svg>);
    case "Mail":
      return (<svg className={className} viewBox="0 0 24 24"><rect {...common as any} x="3" y="5" width="18" height="14" rx="2"/><path {...common as any} d="M3 7l9 6 9-6"/></svg>);
    case "LifeBuoy":
      return (<svg className={className} viewBox="0 0 24 24"><circle {...common as any} cx="12" cy="12" r="10"/><circle {...common as any} cx="12" cy="12" r="4"/><path {...common as any} d="M5.5 5.5l3 3M18.5 5.5l-3 3M5.5 18.5l3-3M18.5 18.5l-3-3"/></svg>);
    case "User":
      return (<svg className={className} viewBox="0 0 24 24"><circle {...common as any} cx="12" cy="8" r="4"/><path {...common as any} d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>);
    case "Send":
      return (<svg className={className} viewBox="0 0 24 24"><path {...common as any} d="M22 2L11 13"/><path {...common as any} d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>);
    case "Settings":
      return (<svg className={className} viewBox="0 0 24 24"><circle {...common as any} cx="12" cy="12" r="3"/><path {...common as any} d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V22a2 2 0 0 1-4 0v-.12a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.12a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 6.07 3.3l.06.06c.47.47 1.16.61 1.82.33A1.65 1.65 0 0 0 9.45 2H9.6a2 2 0 1 1 4 0v.12c0 .68.39 1.29 1 1.51.66.28 1.35.14 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.47.47-.61 1.16-.33 1.82.22.61.83 1 1.51 1H22a2 2 0 0 1 0 4h-.12a1.65 1.65 0 0 0-1.51 1z"/></svg>);
    case "Shield":
      return (<svg className={className} viewBox="0 0 24 24"><path {...common as any} d="M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z"/></svg>);
    case "FileText":
      return (<svg className={className} viewBox="0 0 24 24"><path {...common as any} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path {...common as any} d="M14 2v6h6"/><line {...common as any} x1="8" y1="13" x2="16" y2="13"/><line {...common as any} x1="8" y1="17" x2="14" y2="17"/></svg>);
    case "Cookie":
      return (<svg className={className} viewBox="0 0 24 24"><path {...common as any} d="M21 12a9 9 0 1 1-9-9 3 3 0 0 0 3 3 3 3 0 0 0 3 3 3 3 0 0 0 3 3z"/><circle {...common as any} cx="8.5" cy="10.5" r="1"/><circle {...common as any} cx="12" cy="14" r="1"/><circle {...common as any} cx="15.5" cy="11.5" r="1"/></svg>);
    default:
      return (<svg className={className} viewBox="0 0 24 24"><circle {...common as any} cx="12" cy="12" r="2"/></svg>);
  }
}

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/worker");
  }
  const displayName: string | null =
    (user.user_metadata as any)?.full_name ?? (user.user_metadata as any)?.name ?? user.email ?? null;

  const { data: profile } = await supabase

    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // Rol kontrolü (varsa): sadece worker girebilir
  if (!profile || profile.role !== "worker") {
    redirect("/login?next=/worker");
  }

  const t = await getTranslations('worker.nav');
 // Worker sidebar üst logo (white) – tenant'a göre
  const hdrs = await headers();
   const host = (hdrs.get("x-forwarded-host") || hdrs.get("host") || "").toLowerCase();
 const tenant = tenantFromHost(host);
  const isEN = tenant === "EN";
   const workerLogo = isEN ? "/brand/easycustoms360wh-opt.svg" : "/brand/gumruk360wh-opt.svg";
  const workerAlt = isEN ? "EasyCustoms360" : "Gümrük360";

  return (
    <div className="flex min-h-screen">
        <aside className="sidenav w-60 border-r border-black/10 p-4 hidden md:block">
   
    <div className="mb-4">
      <img src={workerLogo} alt={workerAlt} className="h-12 w-auto block" />
    </div>
    {/* Welcome / Auth panel */}
    <div className="mb-3">
      {displayName ? (
        <div className="text-xs">

              Welcome, <b>{displayName}</b>
            </div>
          ) : (
            <div className="text-xs rounded-lg bg-slate-50 border border-black/5 px-3 py-2 flex items-center gap-3">
              <a href="/login" className="underline">Login</a>
              <a href="/signup" className="underline">Sign up</a>
            </div>
          )}
        </div>
        <nav className="flex flex-col gap-1 text-sm">
		<ActiveLink href="/"><span className="nav-icon"><I name="Info" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("homepage")}</span></ActiveLink>
          <ActiveLink href="/worker"><span className="nav-icon"><I name="LayoutDashboard" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t('assigned')}</span></ActiveLink>
          
          <ActiveLink href="/worker/done" startsWith><span className="nav-icon"><I name="FileText" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t('done')}</span></ActiveLink>

          <div className="h-px my-2 bg-white/10" />
          <ActiveLink href="/worker/contact"><span className="nav-icon"><I name="LayoutDashboard" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t('contact')}</span></ActiveLink>
          <ActiveLink href="/worker/support"><span className="nav-icon"><I name="LifeBuoy" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t('inbox')}</span></ActiveLink>
          <ActiveLink href="/worker/announcements" startsWith><span className="nav-icon"><I name="Megaphone" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t('announcements')}</span></ActiveLink>
          <div className="h-px my-2 bg-white/10" />
          <ActiveLink href="/worker/cv"><span className="nav-icon"><I name="FileText" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t('cvEdit')}</span></ActiveLink>
		  <ActiveLink href="/worker/blog"><span className="nav-icon"><I name="FileText" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t('blog')}</span></ActiveLink>
          <ActiveLink href="/worker/profile"><span className="nav-icon"><I name="User" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t('profilePage')}</span></ActiveLink>
          <a href="/logout" className="link">{t('logout')}</a>
        </nav>
      </aside>
<div className="flex-1 flex flex-col">
<header className="block md:hidden sticky top-0 z-50 bg-white header-brand border-b border-black/10">
  <div className="mx-auto max-w-[clamp(320px,90vw,1280px)] px-4 py-2 flex items-center justify-between gap-3">
    <div className="shrink-0">
      <img src={workerLogo} alt={workerAlt} className="h-8 w-auto" />
    </div>
    <div className="shrink-0">
      <MobileDrawer
        displayName={displayName}
        t={{
          homepage: t("homepage"), assigned: t("assigned"), done: t("done"),
          contact: t("contact"), inbox: t("inbox"), announcements: t("announcements"),
          cvEdit: t("cvEdit"), blog: t("blog"), profilePage: t("profilePage"), logout: t("logout"), welcome: t("dashwellcome")
        }}
      />
    </div>
  </div>
</header>
      <main className="w-full max-w-none md:max-w-[clamp(320px,80vw,1236px)]
                       pl-2 pr-2
                       md:pl-[2%] md:pr-[8%]
                       xl:pl-[3%] xl:pr-[10%]
                       mt-2 md:mt-4">
        <div className="w-full sm:w-full sm:max-w-full mr-auto">
     {children}
   </div>
 </main>
  </div>
    </div>
  );
}