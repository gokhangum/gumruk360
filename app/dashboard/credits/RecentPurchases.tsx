'use client'
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

type Item = {
  order_id: string;
  paid_at: string | null;
  amount: number | null;
  currency: string | null;
  credits: number | null;
  unit_price_lira: number | null;
  total_lira: number | null;
};

export default function RecentPurchases() {
	const t = useTranslations("cred");
const locale = useLocale();

  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'ok'; items: Item[] } | { kind: 'error'; msg: string }>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/credits/recent", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          if (alive) setState({ kind: 'error', msg: json?.error || t('recent.error') });
          return;
        }
        if (alive) setState({ kind: 'ok', items: json.items || [] });
      } catch (e: any) {
        if (alive) setState({ kind: 'error', msg: e?.message || t('common.error') });

      }
    })();
    return () => { alive = false };
  }, []);

  if (state.kind === 'loading') {
    return <div className="text-sm text-gray-500">{t('recent.loading')}</div>;
  }
  if (state.kind === 'error') {
    return <div className="text-sm text-rose-600">{t('recent.loadFailed')}: {state.msg}</div>;
  }

  if (!state.items.length) {
    return <div className="text-sm text-gray-500">{t('recent.empty')}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-2 pr-3">{t('recent.table.date')}</th>

            <th className="py-2 pr-3">{t('recent.table.order')}</th>
            <th className="py-2 pr-3">{t('recent.table.credits')}</th>

            <th className="py-2 pr-3">{t('recent.table.unitTry')}</th>

            <th className="py-2 pr-3">{t('recent.table.total')}</th>

          </tr>
        </thead>
        <tbody>
          {state.items.map((it: Item) => {
            const d = it.paid_at ? new Date(it.paid_at) : null;
            const day = d ? d.toLocaleString(locale) : "-";

            const total = typeof it.total_lira === "number" ? it.total_lira : it.amount;
            return (
              <tr key={it.order_id} className="border-t">
                <td className="py-2 pr-3">{day}</td>
                <td className="py-2 pr-3 font-mono text-xs">{it.order_id}</td>
                <td className="py-2 pr-3">{it.credits ?? "-"}</td>
                <td className="py-2 pr-3">{it.unit_price_lira ? `₺${it.unit_price_lira}` : "-"}</td>
                <td className="py-2 pr-3 font-medium">{typeof total === "number" ? `₺${total}` : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
