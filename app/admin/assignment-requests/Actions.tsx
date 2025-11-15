"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { id: string; adminEmail: string };

export default function Actions({ id, adminEmail }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function call(action: "approve" | "reject") {
    try {
      setBusy(action);
      const res = await fetch(
        `/api/admin/assignment-requests/${id}?email=${encodeURIComponent(
          adminEmail
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const j = await res.json();
      if (!j?.ok) {
        alert(j?.error || "Hata");
        setBusy(null);
        return;
      }
      router.refresh();
      setBusy(null);
    } catch (e: any) {
      alert(e?.message || "Hata");
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        className="px-2 py-1 border rounded"
        disabled={!!busy}
        onClick={() => call("approve")}
      >
        {busy === "approve" ? "Onaylanıyor…" : "Atamayı kabul et"}
      </button>
      <button
        className="px-2 py-1 border rounded"
        disabled={!!busy}
        onClick={() => call("reject")}
      >
        {busy === "reject" ? "Reddediliyor…" : "Atamayı reddet"}
      </button>
    </div>
  );
}
