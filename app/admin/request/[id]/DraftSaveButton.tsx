"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl"
declare global {
  interface Window {
    __editorGetContent?: () => unknown;
  }
}

type Props = {
  /** Kaydettikten sonra otomatik "taslaktan revizyon" yapmak için */
  autoIngestToRevision?: boolean;
  /** Taslağı kaydederken kullanılan alan seçici (fallback) */
  editorSelector?: string; // varsayılan: [data-editor-content]
};

export default function DraftSaveButton(props: Props) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
const t = useTranslations('admin.request.editor')
const tc = useTranslations('common')
  const editorSelector = props.editorSelector ?? "[data-editor-content]";

  function readEditorContent(): unknown {
    // 1) Global getter varsa
    if (typeof window !== "undefined" && typeof window.__editorGetContent === "function") {
      try {
        return window.__editorGetContent();
      } catch {}
    }
    // 2) DOM seçici ile
    if (typeof document !== "undefined") {
      const el = document.querySelector(editorSelector) as HTMLTextAreaElement | HTMLElement | null;
      if (el) {
        // textarea/input ise value; değilse textContent
        const anyEl = el as any;
        if (typeof (anyEl?.value) === "string") return anyEl.value;
        if (typeof el.textContent === "string") return el.textContent;
      }
    }
    // 3) prompt ile kullanıcıdan al
    // eslint-disable-next-line no-alert
    const manual = prompt(t('draft.manualPrompt'));
    return manual ?? "";
  }


  function readEditorHtmlFallback(): string {
    // 0) Global getter (preferred)
    if (typeof window !== "undefined" && typeof window.__editorGetContent === "function") {
      try {
        const v: any = window.__editorGetContent();
        if (v && typeof v.html === "string" && v.html.trim()) return v.html;
      } catch {}
    }
    if (typeof document === "undefined") return "";
    // 1) Hidden bridge textarea
    const htmlEl = document.querySelector('textarea[data-editor-content-html]') as HTMLTextAreaElement | null;
    const textEl = document.querySelector('textarea[data-editor-content]') as HTMLTextAreaElement | null;
    const h = (htmlEl?.value || "").trim();
    if (h) return h;
  // 2) CKEditor DOM (if available)
   const ck = document.querySelector('.ck.ck-content') as HTMLElement | null;
    if (ck && ck.innerHTML && ck.innerHTML.trim()) return ck.innerHTML;
    // 3) Fallback: build minimal HTML from text
    const t = textEl?.value || "";
     return t ? t.replace(/\n/g, "<br/>") : "";
  }
  
  async function saveDraft(content: unknown) {
    const res = await fetch(`/api/admin/questions/${id}/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content, content_html: readEditorHtmlFallback() }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || t('draft.saveFailed'));
    return json.data as { id: string };
  }

  async function ingestDraftToRevision() {
    const res = await fetch(`/api/admin/questions/${id}/revisions/ingest-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || t('revise.createFailed'));
    return json.data as { revision_no: number };
  }

  const handleClick = async () => {
    if (!id) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const content = readEditorContent();
      if (content == null || (typeof content !== "string" && typeof content !== "object")) {
       throw new Error(t('editorView.contentNotFound'));
      }

      await saveDraft(content);
      setMsg(t('draft.saved'));

      if (props.autoIngestToRevision) {
        const rev = await ingestDraftToRevision();
        setMsg(t('draft.savedAndIngested', { no: rev.revision_no }));
      }

      // İsteğe bağlı: sayfayı tazele (ör. revizyon listesine döneceksen)
      // router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? tc('unknown'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button
        onClick={handleClick}
        disabled={busy}
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #dadfe3",
          background: "#fff",
          cursor: "pointer",
        }}
        title={t('tooltips.saveDraft')}
      >
        {busy ? t('draft.saveBusy') : t('draft.save')}
      </button>
      {props.autoIngestToRevision && (
        <span style={{ fontSize: 12, color: "#475467" }}>
         {t('draft.autoIngestHint')}
        </span>
      )}
      {msg && <span style={{ color: "green" }}>{msg}</span>}
      {err && <span style={{ color: "crimson" }}>{err}</span>}
    </div>
  );
}
