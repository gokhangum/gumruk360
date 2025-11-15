"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
type Props = { questionId: string };

/**
 * Görünürlük:
 *  - /api/ask/[id]/credit-options sonucundan
 *    hasActiveOrg === true && orgBalance < requiredOrgCredits ise görünür.
 * Etiket + Davranış:
 *  - org_role === 'owner' → text: owner, Link: /dashboard/subscription
 *  - member          → text: member, TIKLANINCA sadece POST + popup. (hiçbir yere yönlenmez)
 */
export default function OrgTopUpButton({ questionId }: Props) {
	const t = useTranslations("orgTopUp");
  const [visible, setVisible] = React.useState<boolean>(false);
  const [isOwner, setIsOwner] = React.useState<boolean>(false);
  const [qTitle, setQTitle] = React.useState<string>("");
  const [busy, setBusy] = React.useState<boolean>(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/ask/${questionId}/credit-options`, { cache: "no-store" });
        const js = await res.json();

        if (!alive) return;
        if (!res.ok) { setVisible(false); return; }

        const requiredOrgCredits = Number(js?.requiredOrgCredits ?? 0);
        const orgBal = Number(js?.orgBalance ?? 0);
        const hasActiveOrg = !!js?.meta?.hasActiveOrg || !!js?.org;

        const show = hasActiveOrg && requiredOrgCredits > 0 && orgBal < Math.ceil(requiredOrgCredits);
        setVisible(!!show);
        setIsOwner((js?.org?.org_role ?? "member") === "owner");
        setQTitle(js?.question?.title ?? js?.q?.title ?? "");
      } catch {
        if (alive) setVisible(false);
      }
    })();
    return () => { alive = false; };
  }, [questionId]);

  if (!visible) return null;

  // OWNER: normal link (subscription)
  if (isOwner) {
    return (
      <Link
        href="/dashboard/subscription"
        className="btn btn--sm bg-yellow-500 hover:bg-yellow-600 text-black ml-2 disabled:opacity-60"
      >
        {t("owner")}
      </Link>
    );
  }

  // MEMBER: sadece POST + popup
  async function onMemberClick() {
    if (busy) return;
    try {
      setBusy(true);
      const res = await fetch(`/api/ask/${questionId}/org-insufficient-notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: qTitle }),
        cache: "no-store",
      });
      const js = await res.json().catch(() => ({}));
      if (res.ok && js?.ok) {
        alert(t("sent"));
      } else {
        const reason = js?.error ? ` (${js.error}${js?.detail ? ": " + js.detail : ""})` : "";
        alert(t("failed") + reason);
      }
    } catch (e) {
      alert(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onMemberClick}
      disabled={busy}
      className="btn btn--sm bg-yellow-500 hover:bg-yellow-600 text-black ml-2 disabled:opacity-60"
    >
      {busy ? t("sending") : t("member")}
    </button>
  );
}
