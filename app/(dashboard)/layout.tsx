import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import ActiveLink from "@/components/nav/ActiveLink";
import { supabaseServer } from "@/lib/supabase/server";
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
      return (<svg className={className} viewBox="0 0 24 24"><circle {...common as any} cx="12" cy="12" r="3"/><path {...common as any} d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V22a2 2 0 0 1-4 0v-.12a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h-.12a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 1 1 1 6.07 3.3l.06.06c.47.47 1.16.61 1.82.33A1.65 1.65 0 0 0 9.45 2H9.6a2 2 0 1 1 4 0v.12c0 .68.39 1.29 1 1.51.66.28 1.35.14 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.47.47-.61 1.16-.33 1.82.22.61.83 1 1.51 1H22a2 2 0 0 1 0 4h-.12a1.65 1.65 0 0 0-1.51 1z"/></svg>);
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

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("nav");
  const s = await supabaseServer();

  let showSubscription = false; // corporate
  let userEmail: string | null = null;
  let displayName: string | null = null;

  try {
    const { data: { user } } = await s.auth.getUser();
    displayName = (user?.user_metadata as any)?.full_name ?? (user?.user_metadata as any)?.name ?? user?.email ?? null;
    userEmail = user?.email ?? null;

    const accountType = (user?.user_metadata as any)?.account_type as string | undefined;

    if (accountType === "corporate") {
      showSubscription = true;
    } else if (accountType === "individual") {
      showSubscription = false;
    } else {
      // Fallback: org membership
      if (user?.id) {
        const { data: orgs } = await s
          .from("organization_members")
          .select("org_id, status, organizations!inner(plan)")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1);
        if (orgs && orgs.length > 0) {
          showSubscription = true;
        }
      }
    }
  } catch {}

  const emailQuery = userEmail ? `?email=${encodeURIComponent(userEmail)}` : "";

  // Host -> dil ve logolar (tenant bazlı)
  const hdrs = await headers();
  const host = (hdrs.get("x-forwarded-host") || hdrs.get("host") || "").toLowerCase();
  const tenant = tenantFromHost(host);
  const isEN = tenant === "EN";
  const dashLogo = isEN ? "/brand/easycustoms360wh-opt.svg" : "/brand/gumruk360wh-opt.svg";
   const dashAlt = isEN ? "EasyCustoms360" : "Gümrük360";
  const dashLogoMobile = dashLogo;

  const howItWorksHref = showSubscription ? "/dashboard/how-it-works/corporate" : "/dashboard/how-it-works/individual";

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      {/* Benzersiz id: global header ile çakışmayı önler */}

      {/* Drawer: peer-checked ile açılır */}
      <aside className="hidden md:block sidenav md:static md:w-60 fixed inset-y-0 left-0 z-50 w-72 border-r border-black/10 p-4
                    transition-transform duration-200 ease-out
                   
                   md:static  md:w-60">
        <div className="mb-4">
          <img src={dashLogo} alt={dashAlt} className="h-12 w-auto block" />
        </div>

        <div className="mb-3">
          {displayName ? (
            <div className="text-xs">
              {t("dashwellcome")} <b>{displayName}</b>
            </div>
          ) : (
            <div className="text-xs rounded-lg bg-slate-50 border border-black/5 px-3 py-2 flex items-center gap-3">
              <a href="/login" className="underline">{t("dashlogin")}</a>
              <a href="/signup" className="underline">{t("dashsignup")}</a>
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-1 text-sm">
          <ActiveLink href="/"><span className="nav-icon"><I name="LayoutDashboard" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("homepage")}</span></ActiveLink>
          <ActiveLink href={howItWorksHref}><span className="nav-icon"><I name="Info" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("howItWorks")}</span></ActiveLink>
          <ActiveLink href="/ask" className="sidenav link"><span className="nav-icon"><I name="HelpCircle" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("ask")}</span></ActiveLink>
          <ActiveLink href="/dashboard/questions" startsWith><span className="nav-icon"><I name="FileQuestion" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("myQuestions")}</span></ActiveLink>
          <ActiveLink href="/dashboard/orders" startsWith><span className="nav-icon"><I name="CreditCard" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("myPayments")}</span></ActiveLink>
          {showSubscription ? (
            <ActiveLink href="/dashboard/subscription"><span className="nav-icon"><I name="BadgeDollarSign" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("subscriptionManagement")}</span></ActiveLink>
          ) : (
            <ActiveLink href={`/dashboard/credits${emailQuery}`} className="sidenav link"><span className="nav-icon"><I name="BadgeDollarSign" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("creditManagement")}</span></ActiveLink>
          )}
          <ActiveLink href="/dashboard/announcements" startsWith><span className="nav-icon"><I name="Megaphone" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("announcements")}</span></ActiveLink>
          <ActiveLink href="/dashboard/contact"><span className="nav-icon"><I name="Mail" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("contact")}</span></ActiveLink>
          <ActiveLink href="/dashboard/support" startsWith><span className="nav-icon"><I name="LifeBuoy" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("support")}</span></ActiveLink>
          <ActiveLink href="/dashboard/profile"><span className="nav-icon"><I name="User" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("profile")}</span></ActiveLink>
          <ActiveLink href="/dashboard/kvkk-gdpr"><span className="nav-icon"><I name="Shield" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("kvkkGdpr")}</span></ActiveLink>
          <ActiveLink href="/dashboard/terms"><span className="nav-icon"><I name="FileText" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("terms")}</span></ActiveLink>
          <ActiveLink href="/dashboard/cookies"><span className="nav-icon"><I name="Cookie" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">{t("cookies")}</span></ActiveLink>
          <a href="/logout" className="link">{t("logout")}</a>
        </nav>
      </aside>

      {/* Overlay: sadece mobil */}

      {/* Mobile top bar (logo + hamburger) -> sadece <md */}
<header className="block md:hidden sticky top-0 z-50 bg-white header-brand border-b border-black/10">

  <div className="flex items-center justify-between px-4 py-3">
    <img src={dashLogoMobile} alt={dashAlt} className="h-8 w-auto" />
    {/* Hamburger visible: outlined button */}
    <div className="shrink-0">
      <MobileDrawer
        displayName={displayName}
        t={{
          dashwellcome: t("dashwellcome"), dashlogin: t("dashlogin"), dashsignup: t("dashsignup"),
          homepage: t("homepage"), howItWorks: t("howItWorks"), ask: t("ask"), myQuestions: t("myQuestions"),
          myPayments: t("myPayments"), subscriptionManagement: t("subscriptionManagement"),
          creditManagement: t("creditManagement"), announcements: t("announcements"), contact: t("contact"),
          support: t("support"), profile: t("profile"), kvkkGdpr: t("kvkkGdpr"), terms: t("terms"),
          cookies: t("cookies"), legal: t("legal"), logout: t("logout")
        }}
        howItWorksHref={howItWorksHref}
        emailQuery={emailQuery}
        showSubscription={showSubscription}
      />
    </div>
  </div>
</header>

            {/* Content */}
      <main className="w-full max-w-none md:max-w-[clamp(320px,80vw,1036px)]
                       pl-2 pr-2
                       md:pl-[2%] md:pr-[8%]
                       xl:pl-[3%] xl:pr-[10%]
                       mt-2 md:mt-4
                       pb-20 md:pb-0">

        <div className="w-full sm:w-full sm:max-w-full mr-auto">
          {children}
        </div>
      </main>
	        {/* Mobile Bottom Action Bar */}
     <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-[clamp(320px,100vw,1036px)] px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/ask"
              className="btn btn--primary h-11 text-sm"
              title={isEN ? 'Ask a Question' : 'Soru Sor'}
            >
              {isEN ? 'Ask a Question' : 'Soru Sor'}
            </Link>

            <Link
              href={showSubscription ? '/dashboard/how-it-works/corporate' : '/dashboard/how-it-works/individual'}
              className="btn btn--outline h-11 text-sm"
              title={isEN ? 'How it works' : 'Nasıl Çalışır'}
            >
              {isEN ? 'How it works' : 'Nasıl Çalışır'}
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
