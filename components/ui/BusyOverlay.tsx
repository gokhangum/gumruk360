"use client";
import { useTranslations } from "next-intl";
export default function BusyOverlay({
  show,
 labelTR,
   labelEN,
}: {
  show: boolean;
  labelTR?: string;
  labelEN?: string;
}) {
  if (!show) return null;
 const t = useTranslations("common.busyOverlay");
  const label = labelEN || labelTR || t("processing");
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-lg px-6 py-5 flex items-center gap-4">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </div>
  );
}
