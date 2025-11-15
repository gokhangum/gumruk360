
// components/cv/CvPreviewById.tsx
"use client";
import * as React from "react";
import CvPreviewCard from "@/components/cv/CvPreviewCard";
import { useTranslations, useLocale } from "next-intl";

type Block = { id?: string; block_type: string; body_rich?: any; order_no?: number; lang?: "tr" | "en" };
type Profile = { display_name?: string; title_tr?: string; title_en?: string; tags?: string[] | null; hourly_rate_tl?: number | null; photo_object_path?: string | null };



export default function CvPreviewById({ workerId, locale }: { workerId: string; locale?: "tr" | "en" }) {
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [blocks, setBlocks] = React.useState<Block[]>([]);
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
const t = useTranslations("common.cvPreviewById");
  const effLocale = (locale ?? (useLocale() as "tr" | "en"));

  React.useEffect(() => {
    let cancel = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/cv/preview/${workerId}?locale=${effLocale}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error || "cv_preview_failed");
        if (cancel) return;
        setProfile(j.data?.profile ?? null);
        setBlocks(Array.isArray(j.data?.blocks) ? j.data.blocks : []); // server already localized titles
        setPhotoUrl(j.data?.photoUrl ?? null);
      } catch (e: any) {
        if (!cancel) setError(e?.message || "cv_preview_failed");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    if (workerId) run();
    return () => { cancel = true; };
}, [workerId, effLocale]);

  const title = React.useMemo(() => {
    return effLocale === "en" ? (profile?.title_en || "") : (profile?.title_tr || "");
  }, [profile, effLocale]);

  if (loading) return <div className="text-sm text-neutral-500 p-4 border rounded-xl bg-white shadow-sm">{t("loading")}</div>;
  if (error) return <div className="text-sm text-red-600 p-4 border rounded-xl bg-white shadow-sm">{t("loadFailed", { error })}</div>;

  return (
    <div className="w-[720px]">
      <CvPreviewCard
        photoUrl={photoUrl}
        displayName={profile?.display_name ?? null}
        title={title}
        hourlyRate={profile?.hourly_rate_tl ?? null}
        tags={(profile?.tags as any) || []}
        blocks={blocks || []}
        locale={effLocale}
        showHourlyRate={false}
      />
    </div>
  );
}
