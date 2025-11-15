
// components/cv/CvHoverPreview.tsx
"use client";
import * as React from "react";
import CvPreviewCard from "@/components/cv/CvPreviewCard";
import { useTranslations } from "next-intl";
type Block = { id?: string; block_type: string; body_rich?: any; order_no?: number; lang?: "tr" | "en" };
type BlockType = { id?: string; key: string; title_tr: string; title_en: string; order_no?: number };
type Profile = { display_name?: string; title_tr?: string; title_en?: string; tags?: string[] | null; hourly_rate_tl?: number | null };

export default function CvHoverPreview({ workerId, locale = "tr" }: { workerId: string; locale?: "tr" | "en" }) {
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [blocks, setBlocks] = React.useState<Block[]>([]);
  const [types, setTypes] = React.useState<BlockType[]>([]);
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
const t = useTranslations("common.cvHoverPreview");
  React.useEffect(() => {
    let cancel = false;
    async function run() {
      setLoading(true);
      try {
        const [pr, br, tr, fr] = await Promise.all([
          fetch(`/api/admin/consultants/${workerId}/cv/profile`, { cache: "no-store" }),
          fetch(`/api/admin/consultants/${workerId}/cv/blocks`, { cache: "no-store" }),
          fetch(`/api/admin/consultants/${workerId}/cv/block-types`, { cache: "no-store" }),
          fetch(`/api/admin/consultants/${workerId}/cv/photo/url`, { cache: "no-store" }),
        ]);
        const [pj, bj, tj, fj] = await Promise.all([pr.json().catch(()=>({})), br.json().catch(()=>({})), tr.json().catch(()=>({})), fr.json().catch(()=>({}))]);
        if (!cancel) {
          if (pj?.ok && pj?.data) setProfile(pj.data);
          if (bj?.ok && Array.isArray(bj?.data)) setBlocks(bj.data);
          if (tj?.ok && Array.isArray(tj?.data)) setTypes(tj.data);
          if (fj?.ok && fj?.url) setPhotoUrl(fj.url);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    if (workerId) run();
    return () => { cancel = true; };
  }, [workerId]);

  const localizedTitle = React.useMemo(() => {
    if (!profile) return "";
    return locale === "en" ? (profile.title_en || "") : (profile.title_tr || "");
  }, [profile, locale]);

  const hourly = profile?.hourly_rate_tl ?? null;

  // CvPreviewCard beklediği basit props ile besleniyor
  return (
    <div className="w-[680px] pointer-events-none">
      {loading ? (
        <div className="text-sm text-neutral-500 p-4 border rounded-xl bg-white shadow-sm">{t("loading")}</div>
      ) : (
        <CvPreviewCard
          photoUrl={photoUrl ?? null}
          displayName={profile?.display_name ?? null}
          title={localizedTitle}
          hourlyRate={hourly ?? null}
          tags={(profile?.tags as any) || []}
          blocks={blocks || []}
          locale={locale}
          showHourlyRate={false}
        />
      )}
    </div>
  );
}
