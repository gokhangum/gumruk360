"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
export default function MembersDeleteButton({ userId, onDone }: { userId: string; onDone?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
const tDash = useTranslations("dashboard.subscription");
const tCommon = useTranslations("common");
const tProg = useTranslations("progress");

  const onClick = async () => {
    if (!confirm(tDash("removeMemberConfirm"))) return;

    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/dashboard/subscription/members/${userId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "delete_failed");
      }
      onDone?.();
    } catch (e: any) {
      setErr(e?.message === "delete_failed" ? tCommon("deleteFailed") : (e?.message || tCommon("deleteFailed")));

    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="px-2 py-1 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50"
        title={tDash("removeMemberTitle")}

      >
        {loading ? tProg("processing") : tCommon("delete")}

      </button>
      {err && <span className="text-red-600 text-xs">{err}</span>}
    </div>
  );
}
