"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
type Props = { questionId: string };

type CreditOptions = {
  requiredCredits: number;
  requiredUserCredits: number;
  requiredOrgCredits: number;
  userBalance: number;
  orgBalance?: number | null;
  canUserPay: boolean;
  canOrgPay: boolean;
  meta?: { hasActiveOrg?: boolean } | null;
};



export default function CreditPayButtons({ questionId }: Props) {
	const t = useTranslations("creditPay");
  const router = useRouter();
  const [data, setData] = React.useState<CreditOptions | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/ask/${questionId}/credit-options`, { cache: "no-store" });
        const js = await res.json();
        if (!mounted) return;
        if (res.ok) setData(js);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [questionId]);

  if (loading) return null;

  const canUserPay = !!data?.canUserPay;
  const requiredUser = Number(data?.requiredUserCredits ?? 0);
  const userBal = Number(data?.userBalance ?? 0);
  const neededSafe = Number.isFinite(requiredUser) && requiredUser > 0 ? Math.ceil(requiredUser) : 0;
  const balanceSafe = Number.isFinite(userBal) && userBal > 0 ? Math.floor(userBal) : 0;

  // Yeni kural: bireysel bakiye 0 ise bu bileşen buton render ETMEZ
  if (balanceSafe === 0) return null;

  // Only one button shown; no summary
  if (canUserPay) {
    return (
      <button
        onClick={() => router.push(`/ask/${questionId}/confirm-user-credits`)}
        className="btn text-sm px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
      >
        {t("payWithCredits")}
      </button>
    );
  }

  if (balanceSafe > 0 && balanceSafe < neededSafe) {
    return (
      <Link
        href="/dashboard/credits"
      className="btn text-sm px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
      >
        {t("topUp")}
      </Link>
    );
  }

  if (balanceSafe === 0 && neededSafe > 0) {
    return (
      <Link
        href="/dashboard/credits"
        className="btn text-sm px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
      >
        {t("buyCredits")}
      </Link>
    );
  }

  return null;
}
