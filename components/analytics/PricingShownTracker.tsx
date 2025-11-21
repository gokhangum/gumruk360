"use client";

import { useEffect } from "react";
import { pushEvent } from "@/lib/datalayer";

type Props = {
  questionId: string;
  price: number;
  currency: string;
};

export default function PricingShownTracker({ questionId, price, currency }: Props) {
  useEffect(() => {
    if (!Number.isFinite(price) || price <= 0) return;

    try {
      const host = typeof window !== "undefined" ? window.location.hostname : "";
      const tenant = host.includes("easycustoms360") ? "easycustoms360" : "gumruk360";
      const locale = tenant === "easycustoms360" ? "en-US" : "tr-TR";

      pushEvent("pricing_shown", {
        tenant,
        locale,
        question_id: questionId,
        price,
        currency,
      });
    } catch {}
  }, [questionId, price, currency]);

  return null;
}
