"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { bulkArchive, bulkPublish, bulkSchedule, publishOne, scheduleOne, archiveOne, deleteOne, unpublishToReviewOne, bulkUnpublishToReview } from "./actions";

type Row = {
  id: string;
  slug: string;
  lang: string;
  tenant_code: string | null;
  title: string;
  author_name: string | null;
  status: string;
  scheduled_at: string | null;
  updated_at: string;
  created_at: string;
};

export default function ClientTable({ rows }: { rows: Row[] }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [scheduleISO, setScheduleISO] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const selectedIds = Object.entries(checked).filter(([,v]) => v).map(([k]) => k);
  const selectedSlugs = rows.filter(r => checked[r.id]).map(r => r.slug);

  function toggleAll(val: boolean) {
    const next: Record<string, boolean> = {};
    rows.forEach(r => next[r.id] = val);
    setChecked(next);
  }
const t = useTranslations("admin.blog.review");
  return (
    <div className="bg-white rounded-2xl border border-gray-200">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="text-sm text-gray-600">
          {t("table.count", { total: rows.length, selected: selectedIds.length })}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            className="input input-sm border rounded-md px-2 py-1"
            value={scheduleISO}
            onChange={e => setScheduleISO(e.target.value)}
          />
          <button
            disabled={selectedIds.length === 0 || isPending}
            onClick={() => startTransition(async () => {
              await bulkPublish(selectedIds, selectedSlugs);
              router.refresh();
            })}
            className="btn btn--sm bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-1.5"
          >
            {isPending ? t("bulk.publishing") : t("bulk.publish")}
          </button>
          <button
            disabled={selectedIds.length === 0 || isPending}
            onClick={() => startTransition(async () => {
              await bulkSchedule(selectedIds, scheduleISO);
              router.refresh();
            })}
            className="btn btn--sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5"
          >
            {isPending ? t("bulk.scheduling") : t("bulk.schedule")}
          </button>
          <button
            disabled={selectedIds.length === 0 || isPending}
            onClick={() => startTransition(async () => {
              await bulkArchive(selectedIds);
              router.refresh();
            })}
            className="btn btn--sm bg-gray-700 hover:bg-gray-800 text-white rounded-lg px-3 py-1.5"
          >
            {isPending ? t("bulk.archiving") : t("bulk.archive")}
          </button>
        </div>
		<button
  disabled={selectedIds.length === 0 || isPending}
  onClick={() => startTransition(async () => {
    await bulkUnpublishToReview(selectedIds);
    router.refresh();
  })}
  className="btn btn--sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-1.5"
  title={t("bulk.review.title")}
>
  {isPending ? t("bulk.reverting") : t("bulk.review.label")}
</button>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
            <th className="w-10">
              <input
                type="checkbox"
                onChange={(e) => toggleAll(e.target.checked)}
                checked={rows.length>0 && rows.every(r => checked[r.id])}
                aria-label={t("table.aria.selectAll")}
              />
            </th>
            <th>{t("col.title")}</th>
            <th>{t("col.lang")}</th>
            <th>{t("col.tenant")}</th>
            <th>{t("col.status")}</th>
            <th>{t("col.scheduled")}</th>
            <th>{t("col.updated")}</th>
            <th className="text-right pr-3">{t("col.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t hover:bg-gray-50">
              <td className="px-3 py-2 align-top">
                <input
                  type="checkbox"
                  checked={!!checked[r.id]}
                  onChange={(e) => setChecked(prev => ({...prev, [r.id]: e.target.checked}))}
                  aria-label={t("table.aria.select", { title: r.title })}
                />
              </td>
              <td className="px-3 py-2 align-top">
                <div className="font-medium">
                  {/* Admin edit sayfasına link */}
                  <Link href={`/admin/blog/edit/${r.id}`} className="hover:underline">{r.title}</Link>
                </div>
                <div className="text-xs text-gray-500">{r.slug}</div>
                {r.author_name && <div className="text-xs text-gray-500">{t("row.by", { name: r.author_name })}</div>}
                <div className="text-xs mt-1 flex gap-2">
                  <a href={`/blog/${r.slug}`} className="text-blue-700 hover:underline" target="_blank">{t("link.viewPublic")}</a>
                  <Link href={`/admin/blog/edit/${r.id}`} className="text-gray-700 hover:underline">{t("link.edit")}</Link>
                </div>
              </td>
              <td className="px-3 py-2 align-top">{r.lang}</td>
              <td className="px-3 py-2 align-top">{r.tenant_code ?? t("table.emptyCell")}</td>
              <td className="px-3 py-2 align-top">{r.status}</td>
              <td className="px-3 py-2 align-top">{r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : t("table.emptyCell")}</td>
              <td className="px-3 py-2 align-top">{new Date(r.updated_at).toLocaleString()}</td>
              <td className="px-3 py-2 align-top">
                <RowActions row={r} after={() => router.refresh()} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({ row, after }: { row: Row, after: () => void }) {
  const [iso, setIso] = useState<string>("");
  const [isPending, startTransition] = useTransition();
const t = useTranslations("admin.blog.review");
  async function onDelete() {
    if (!confirm(t("actions.delete.confirm", { title: row.title }))) return;
    await deleteOne(row.id);
    after();
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      <button
        className="btn btn--sm bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-1.5"
        disabled={isPending}
        onClick={() => startTransition(async () => {
          await publishOne(row.id, row.slug);
          after();
        })}
      >
       {t("actions.publish")}
      </button>
      <input
        type="datetime-local"
        className="input input-sm border rounded-md px-2 py-1"
        value={iso}
        onChange={e => setIso(e.target.value)}
      />
      <button
        className="btn btn--sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5"
        disabled={isPending}
        onClick={() => startTransition(async () => {
          await scheduleOne(row.id, iso);
          after();
        })}
      >
        {t("actions.schedule")}
      </button>
	  <button
  className="btn btn--sm bg-amber-600 hover:bg-amber-700 text-black rounded-lg px-3 py-1.5"
  disabled={isPending || row.status !== "published"}
  onClick={() => startTransition(async () => {
    await unpublishToReviewOne(row.id);
    after();
  })}
  title={t("actions.toReview.title")}
>
  {t("actions.toReview.label")}
</button>
      <button
        className="btn btn--sm bg-gray-700 hover:bg-gray-800 text-white rounded-lg px-3 py-1.5"
        disabled={isPending}
        onClick={() => startTransition(async () => {
          await archiveOne(row.id);
          after();
        })}
      >
        {t("actions.archive")}
      </button>
      <button
        className="btn btn--sm bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-1.5"
        onClick={() => startTransition(onDelete)}
        disabled={isPending}
        title={t("actions.delete.title")}
      >
       {t("actions.delete.label")}
      </button>
    </div>
  );
}
