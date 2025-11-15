"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
type PurchaseRow = { id: string; change: number; created_at: string };
type UsageRow = {
  id: string;
  change: number;
  reason: string | null;
  created_at: string;
  question_id: string | null;
  question_title?: string | null;
  asker_name?: string | null;
};

export default function SubscriptionHistoryPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") === "usage" ? "usage" : "purchases") as "purchases" | "usage";

  const [activeTab, setActiveTab] = useState<"purchases" | "usage">(initialTab);
  const [loading, setLoading] = useState<boolean>(false);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [members, setMembers] = useState<any[]>([]);
 const t = useTranslations("dash.subscriptionHistory");
   const locale = useLocale();
  useEffect(() => {
    // URL'deki tab parametresini UI ile senkron tut
    const urlTab = searchParams.get("tab");
    if (urlTab === "purchases" || urlTab === "usage") {
      setActiveTab(urlTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/dashboard/subscription", { cache: "no-store" });
        const data = await res.json();

        if (cancelled) return;

        setIsOwner(Boolean(data?.isOwner));
        setPurchases(Array.isArray(data?.purchases) ? data.purchases : []);
        setUsage(Array.isArray(data?.usage) ? data.usage : []);
        setMembers(Array.isArray(data?.members) ? data.members : []);
      } catch (e) {
        
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totalPurchases = purchases.length;
  const totalUsage = usage.length;

  const OnlyOwnerMsg = useMemo(() => (
    <div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 text-sm text-gray-700">
     {t("onlyOwner")}
    </div>
), [t]);

  const EmptyMsg = useMemo(() => (
    <div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-4 py-3 text-sm text-gray-700">
      {t("empty")}
    </div>
 ), [t]);

  const TabBtn = (props: { id: "purchases" | "usage"; label: string; count?: number }) => {
    const active = activeTab === props.id;
    return (
      <button
        onClick={() => {
          setActiveTab(props.id);
          const params = new URLSearchParams(Array.from(searchParams.entries()));
          params.set("tab", props.id);
          router.replace(`/dashboard/subscription/history?${params.toString()}`);
        }}
       className={[
          "btn btn--ghost text-sm",
       active ? "aria-pressed" : ""
       ].join(" ")}
      >
        {props.label}{typeof props.count === "number" ? t("tabs.countSuffix", { count: props.count }) : ""}
      </button>
    );
  };

  return (
  <div className="bg-gradient-to-b from-white to-slate-0 py-1">
    <div className="w-full max-w-none md:max-w-[clamp(320px,90vw,1680px)] -mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5">
      <div className="card-surface shadow-colored p-5 md:p-6 space-y-5">
      <div className="mb-4 md:mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("title")} </h1>
      
      </div>

      <div className="flex gap-2 mb-5">
       <TabBtn id="purchases" label={t("tabs.purchases")} count={totalPurchases} />
     <TabBtn id="usage" label={t("tabs.usage")} count={totalUsage} />
      </div>

      {activeTab === "purchases" ? (
        <section>
          <h2 className="sr-only">{t("sr_purchases")}</h2>
          {loading ? (
            <div className="p-3">{t("loading")}</div>
          ) : (
            <>
              {isOwner === false ? (
                OnlyOwnerMsg
              ) : purchases.length === 0 ? (
                EmptyMsg
              ) : (
                <div className="card-surface p-0 edge-underline edge-blue edge-taper edge-rise-2mm overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-3 py-2 text-left">{t("purchasesTable.date")}</th>
                        <th className="px-3 py-2 text-right">{t("purchasesTable.creditPlus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((r) => (
                        <tr key={r.id} className="border-t">
                          <td className="px-3 py-2">{new Date(r.created_at).toLocaleString(locale)}</td>
                          <td className="px-3 py-2 text-right">{r.change}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <section>
          <h2 className="sr-only">{t("sr_usage")}</h2>
          {loading ? (
            <div className="p-3">{t("loading")}</div>
          ) : (
            <>
              {isOwner === false ? (
                OnlyOwnerMsg
              ) : usage.length === 0 ? (
                EmptyMsg
              ) : (
                <div className="card-surface p-0 edge-underline edge-blue edge-taper edge-rise-2mm overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                       <th className="px-3 py-2 text-left">{t("usageTable.date")}</th>
                    <th className="px-3 py-2 text-left">{t("usageTable.description")}</th>
                      <th className="px-3 py-2 text-left">{t("usageTable.question")}</th>
                        <th className="px-3 py-2 text-left">{t("usageTable.asker")}</th>
                      <th className="px-3 py-2 text-right">{t("usageTable.creditMinus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.map((r) => (
                        <tr key={r.id} className="border-t">
                          <td className="px-3 py-2">{new Date(r.created_at).toLocaleString(locale)}</td>
                          <td className="px-3 py-2">{r.reason ?? "-"}</td>
                          <td className="px-3 py-2">
  {r.question_id ? (
    <Link href={`/dashboard/questions/${r.question_id}`} className="underline">
      {r.question_title ?? r.question_id}
    </Link>
  ) : (
    "-"
  )}
</td>
                          <td className="px-3 py-2">{r.asker_name ?? "-"}</td>
                          <td className="px-3 py-2 text-right">{new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: false }).format(Math.abs(Number(r.change)))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}
   </div>      
   </div>       
   </div>        
  );
}
