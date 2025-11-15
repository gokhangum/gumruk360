import React from "react";
import { getAuthFromCookies } from "@/lib/auth/getAuthFromCookies";
import Header from "@/components/marketing/Header";
import Footer from "@/components/marketing/Footer";

export const dynamic = "force-dynamic";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { isAuth, userName } = await getAuthFromCookies();

  return (
    <div className="min-h-dvh flex flex-col bg-white text-slate-900">
      <Header isAuth={isAuth} userName={userName} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
