// app/admin/seo/RowActions.tsx
"use client";
import { deleteSeoAction, toggleSeoActiveAction } from "./actions";

export default function RowActions(props: { tenant_code: string; locale: string; route: string; is_active: boolean }) {
  const { tenant_code, locale, route, is_active } = props;

  return (
    <div className="flex items-center gap-2">
      {/* Edit: navigate with query to prefill */}
      <form method="get" className="inline">
        <input type="hidden" name="edit_tenant" value={tenant_code} />
        <input type="hidden" name="edit_locale" value={locale} />
        <input type="hidden" name="edit_route" value={route} />
        <button type="submit" className="px-2 py-1.5 rounded border hover:bg-gray-50">Düzenle</button>
      </form>

      {/* Toggle active via server action */}
      <form className="inline">
        <input type="hidden" name="tenant_code" value={tenant_code} />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="route" value={route} />
        <input type="hidden" name="next_is_active" value={(!is_active).toString()} />
        <button formAction={toggleSeoActiveAction} className="px-2 py-1.5 rounded border hover:bg-gray-50">
          {is_active ? "Pasifleştir" : "Aktifleştir"}
        </button>
      </form>

      {/* Delete with confirm */}
      <form className="inline" onSubmit={(e)=>{ if(!confirm("Silinsin mi?")) e.preventDefault(); }}>
        <input type="hidden" name="tenant_code" value={tenant_code} />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="route" value={route} />
        <button formAction={deleteSeoAction} className="px-2 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50">
          Sil
        </button>
      </form>
    </div>
  );
}
