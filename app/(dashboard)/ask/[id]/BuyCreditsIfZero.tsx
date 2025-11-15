"use client";

import React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
type Props = {
  questionId: string;
};

type CreditOptions = {
  requiredUserCredits: number;
  userBalance: number;
};

function findTargetRow(): HTMLElement | null {
  // 1) Prefer explicit hooks if they exist in your markup
  const explicit = document.querySelector<HTMLElement>(
    '[data-test="target-delivery-row"],[data-field="target_delivery"],.js-target-delivery'
  );
  if (explicit) return explicit as HTMLElement;

  // 2) Fallback: search by visible text "Hedef teslim:" or "Target delivery:"
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("div,td,th,span,label,p,li"));
  for (const el of candidates) {
    const txt = (el.textContent || "").trim().toLowerCase();
    if (txt.startsWith("hedef teslim:") || txt.startsWith("target delivery:")) {
      // Use the row container (likely parent) as anchor
      return (el.parentElement as HTMLElement) ?? el;
    }
  }
  return null;
}

export default function BuyCreditsIfZero({ questionId }: Props) {
	const t = useTranslations("creditPay");
  const [data, setData] = React.useState<CreditOptions | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);

  // Locate the target row once on mount
  React.useEffect(() => {
    const row = findTargetRow();
    if (!row) return;

    // Create a right-aligned placeholder INSIDE the row
    const holder = document.createElement("span");
    holder.className = "g360-buyzero-holder inline-flex ml-auto";
    // Append at the end so it sits at the far right in typical flex/grid rows
    row.appendChild(holder);
    setAnchor(holder);

    return () => {
      try { holder.remove(); } catch {}
    };
  }, []);

  // Fetch credit options
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

  if (loading || !anchor) return null;

  const required = Number(data?.requiredUserCredits ?? 0);
  const bal = Number(data?.userBalance ?? 0);

  // Render ONLY if required > 0 and user's balance is exactly zero
  if (!(required > 0 && bal === 0)) return null;

  const button = (
    <Link
      href="/dashboard/credits"
      className="btn btn--sm bg-blue-600 hover:bg-blue-700 text-white"
    >
      {t("buyCredits")}
    </Link>
  );

  return createPortal(button, anchor);
}
