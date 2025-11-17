import Link from "next/link";
import ActiveLink from "@/components/nav/ActiveLink";
import AdminMobileDrawer from "./MobileDrawer";
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

 export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      {/* Mobil üst bar + hamburger */}
    <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 md:hidden">
       <div className="font-semibold">Admin</div>
        <AdminMobileDrawer />
      </div>
    <div className="grid md:grid-cols-[240px_1fr]">
      <aside className="sidenav w-60 border-r border-black/10 p-4 hidden md:block">
        <div className="title font-semibold mb-4">Admin</div>
        <nav className="flex flex-col gap-1 text-sm">
          
          <ActiveLink href="/admin/requests" startsWith><span className="nav-icon"><I name="CircleHelp" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Talepler</span></ActiveLink>
          <ActiveLink href="/admin/assignment-requests"><span className="nav-icon"><I name="Shield" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Atama talepleri</span></ActiveLink>
          <ActiveLink href="/admin/users"><span className="nav-icon"><I name="User" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Kullanıcılar</span></ActiveLink>
          <ActiveLink href="/admin/payments"><span className="nav-icon"><I name="CreditCard" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Ödemeler</span></ActiveLink>
          <ActiveLink href="/admin/stats"><span className="nav-icon"><I name="LayoutDashboard" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">İstatistikler</span></ActiveLink>
          <ActiveLink href="/admin/announcements" startsWith><span className="nav-icon"><I name="Megaphone" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Bildirim &amp; Haber</span></ActiveLink>
          <ActiveLink href="/admin/contact"><span className="nav-icon"><I name="Mail" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Mesaj Kutusu</span></ActiveLink>
          <ActiveLink href="/admin/blog/review"><span className="nav-icon"><I name="FileQuestion" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Blog</span></ActiveLink>
          <ActiveLink href="/admin/news"><span className="nav-icon"><I name="FileQuestion" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Haber&Duyuru</span></ActiveLink>
          <ActiveLink href="/admin/gpt-modulu"><span className="nav-icon"><I name="Settings" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">GPT Modülü</span></ActiveLink>
		  <ActiveLink href="/admin/taslak-modulu"><span className="nav-icon"><I name="FileText" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Taslak Modülü</span></ActiveLink>
		  <ActiveLink href="/admin/dokuman-yukleme"><span className="nav-icon"><I name="Send" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">RAG Döküman Yükleme</span></ActiveLink>
          <ActiveLink href="/admin/settings"><span className="nav-icon"><I name="Settings" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Ayarlar</span></ActiveLink>
		  <ActiveLink href="/admin/subscription-settings"><span className="nav-icon"><I name="BadgeDollarSign" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Abonelik Ayarları</span></ActiveLink>
          <ActiveLink href="/admin/fx-payments"><span className="nav-icon"><I name="Coins" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">FX Ödeme Ayarları</span></ActiveLink>
		  <ActiveLink href="/admin/gpt-precheck"><span className="nav-icon"><I name="Settings" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">GPT Precheck</span></ActiveLink>
          <ActiveLink href="/admin/logs"><span className="nav-icon"><I name="FileText" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Log kayıtları</span></ActiveLink>
		  <ActiveLink href="/admin/consultants"><span className="nav-icon">‍<I name="User" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Danışmanlar</span></ActiveLink>
		  <ActiveLink href="/admin/danisman-odeme-yonetimi"><span className="nav-icon"><I name="Coins" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Danışman Ödeme Yönetimi</span></ActiveLink>
		  <ActiveLink href="/admin/seo"><span className="nav-icon"><I name="Coins" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Tenant Seo</span></ActiveLink>
          <ActiveLink href="/admin/tools/bulk-delete-questions"><span className="nav-icon"><I name="FileQuestion" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Soru Silme</span></ActiveLink>
          <ActiveLink href="/admin/tools/cleanup-order-payments"><span className="nav-icon"><I name="FileQuestion" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Order Silme</span></ActiveLink>
		  <ActiveLink href="/admin/tools/bulk-delete-payments"><span className="nav-icon"><I name="FileQuestion" className="h-4 w-4 opacity-70" strokeWidth={1.5} /></span><span className="link-label">Payment Silme</span></ActiveLink>
          <div className="h-px my-2 bg-white/10" />
          <a href="/logout" className="link">Çıkış</a>
          {/* Abonelik Ayarları (isteğe bağlı) */}
  {/* <ActiveLink href="/admin/subscription-settings"><span className="nav-icon">💳</span><span className="link-label">Abonelik Ayarları</span></ActiveLink> */}
       </nav>
    </aside>
    <main className="p-4 md:p-6 surface max-w-screen-xl mx-auto">
       {children}
      </main>
      </div>
    </div>
  );
 }
