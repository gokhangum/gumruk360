"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
export default function ConfirmPay({
  questionId,
  mode, // 'user' | 'org'
}: {
  questionId: string;
  mode: "user" | "org";
}) {
  const router = useRouter();
  const t = useTranslations("confirmPay");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [termsChecked, setTermsChecked] = React.useState(false);

  async function onConfirm() {
    if (!termsChecked) return;
    setLoading(true);
    setError(null);
    try {
      const url = mode === "user"
        ? `/api/ask/${questionId}/pay-credit`
        : `/api/ask/${questionId}/pay-org-credit`;
      const res = await fetch(url, { method: "POST" });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "payment_failed");
      const target = (mode === "org" && typeof j.redirectTo === "string" && j.redirectTo)
         ? j.redirectTo : (mode === "user" ? "/dashboard/credits" : "/dashboard/questions");
       router.replace(target);
    } catch (e:any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
<p className="text-gray-700">
  {t.rich("info", { b: (chunks) => <b>{chunks}</b> })}
</p>

      <label className="flex items-start gap-2 select-none cursor-pointer">
        <input
          id="termsCheck"
          type="checkbox"
          checked={termsChecked}
          onChange={(e) => setTermsChecked(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span className="text-sm text-gray-800">
          <a
            href="/legal/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            title={t("openTermsTitle")}
          >
            {t("terms")}
          </a>
          {" "}{t("agreeTail")}
        </span>
      </label>

      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          disabled={loading || !termsChecked}
          className="btn btn--sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
        >
          {loading ? t("processing") : t("confirmPay")}
        </button>
        <button
          onClick={() => history.back()}
          className="btn btn--ghost"
          disabled={loading}
        >
          {t("cancel")}
        </button>
      </div>

      {error && <div className="text-red-600">{error}</div>}
    </div>
  );
}
