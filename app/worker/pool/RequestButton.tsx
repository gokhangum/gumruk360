"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function RequestButton({ questionId }: { questionId: string }) {
  const t = useTranslations("worker");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function submit() {
    try {
      setBusy(true);
      const res = await fetch(
        `/api/worker/assignment-requests?questionId=${encodeURIComponent(
          questionId
        )}`,
        { method: "POST" }
      );
      const j = await res.json();
      if (!j?.ok) {
        alert(j?.error || tCommon("error"));
        setBusy(false);
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (e: any) {
      alert(e?.message || tCommon("error"));
      setBusy(false);
    }
  }

  return (
    <button
      onClick={submit}
      disabled={busy || pending}
      className="px-3 py-1.5 rounded border hover:bg-gray-50 disabled:opacity-50"
    >
      {busy || pending ? t("requesting") : t("requestAssignment")}
    </button>
  );
}
