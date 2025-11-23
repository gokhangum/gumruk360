"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { useTranslations } from "next-intl";

const LS_KEY = "askAiNoticeAccepted_v1";

export default function AskAiNoticeModal() {
  const t = useTranslations("askAiNotice");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const accepted =
      typeof window !== "undefined" &&
      window.localStorage.getItem(LS_KEY) === "yes";
    setOpen(!accepted);
  }, []);
 useEffect(() => {
   const handler = () => {
     setOpen(true);
   };
   (window as any).__openAskAiNoticeModal = handler;
   return () => {
       if ((window as any).__openAskAiNoticeModal === handler) {
       // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
       delete (window as any).__openAskAiNoticeModal;
      }
   };
  }, []);
  const handleApprove = () => {
    try {
      localStorage.setItem(LS_KEY, "yes");
    } catch {}
    setOpen(false);
  };

  const handleExit = () => {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
    router.replace("/");
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={handleExit} widthClassName="max-w-3xl">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="mt-1 h-9 w-9 shrink-0 rounded-2xl bg-indigo-600/10 text-indigo-700 flex items-center justify-center text-lg">
            ⚙️
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {t("title")}
            </h2>
            <p className="mt-1 text-sm text-gray-600">{t("intro")}</p>
          </div>
        </div>

        <ul className="space-y-3 text-[15px] leading-relaxed">
          <li>• {t("bullets.1")}</li>
          <li>• {t("bullets.2")}</li>
          <li>• {t("bullets.3")}</li>
          <li>
            • {t("bullets.4")}{" "}
            <span className="font-semibold">OpenAI API</span>{" "}
            {t("bullets.4b")}
          </li>
          <li>
            • <span className="font-semibold">{t("bullets.5a")}</span>{" "}
            {t("bullets.5b")}
            <a
              className="text-indigo-700 hover:underline ml-1"
              href="https://platform.openai.com/docs/guides/your-data"
              target="_blank"
              rel="noreferrer"
            >
              {t("links.dataControls")}
            </a>
            ,{" "}
            <a
              className="text-indigo-700 hover:underline ml-1"
              href="https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/"
              target="_blank"
              rel="noreferrer"
            >
              {t("links.howYourDataIsUsed")}
            </a>
            .
          </li>
          <li>
            • {t("bullets.6a")}{" "}
            <span className="font-semibold">30 {t("common.days")}</span>{" "}
            {t("bullets.6b")}{" "}
            <a
              className="text-indigo-700 hover:underline ml-1"
              href="https://platform.openai.com/docs/guides/your-data"
              target="_blank"
              rel="noreferrer"
            >
              {t("links.dataControls")}
            </a>
            .
          </li>
          <li>
            • {t("bullets.7a")}{" "}
            <span className="font-semibold">{t("bullets.7b")}</span>{" "}
            {t("bullets.7c")}
          </li>
          <li>• {t("bullets.8")}</li>
          <li>• {t("bullets.9")}</li>
        </ul>

        <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
          <p className="font-medium">{t("summary.title")}</p>
          <p>{t("summary.text")}</p>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-gray-300"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>{t("consentLabel")}</span>
        </label>

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={handleExit}
            className="rounded-xl border px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            {t("buttons.exit")}
          </button>
          <button
            onClick={handleApprove}
            disabled={!checked}
            className="rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("buttons.approve")}
          </button>
        </div>

        <p className="text-[12px] text-gray-500">{t("note")}</p>
      </div>
    </Modal>
  );
}
