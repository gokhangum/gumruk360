// components/blog/RichEditor.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import InlineQuote from "@/components/tiptap/InlineQuote"; 
// --- Tiptap core extensions (v2.26.3 pinned) ---
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Blockquote from "@tiptap/extension-blockquote";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import History from "@tiptap/extension-history";
import Dropcursor from "@tiptap/extension-dropcursor";
import Gapcursor from "@tiptap/extension-gapcursor";
import HardBreak from "@tiptap/extension-hard-break";
import Heading from "@tiptap/extension-heading";
import Link from "@tiptap/extension-link";
import LinkSuggestDrawer from "@/components/blog/LinkSuggestDrawer";
import { useTranslations, useLocale } from "next-intl";
// --- Extras ---
import { FloatImage } from "@/components/tiptap/FloatImage";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";


type Props = {
postId?: string;               // Primary identifier (blog/news record id)
 docId?: string;                // Alias for legacy callers (e.g., NewsForm)
  entity?: "blog" | "news";      // Defaults to "blog"
   uploadEndpoint?: string;       // Override upload endpoint
  uploadBase?: "blog" | "news";  // Legacy hint; used to infer entity
   value?: any;                   // TipTap JSON
  onChange?: (json: any) => void;
   placeholder?: string;
 };

export default function RichEditor({ postId, docId, entity, uploadEndpoint, uploadBase, value, onChange, placeholder }: Props) {
	  const t = useTranslations("RichEditor");
  const locale = useLocale();
  const effectivePlaceholder = placeholder ?? t("placeholder");
  // Resolve kind/endpoint and effectivePostId
  const kind = (entity ?? uploadBase ?? "blog") as "blog" | "news";
  const effectivePostId = postId || docId || "";
  const endpoint = uploadEndpoint ?? (kind === "news" ? "/api/news/upload-image" : "/api/blog/upload-image");

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);        // ⬅️ eklendi
  useEffect(() => setMounted(true), []);               // ⬅️ eklendi
const [showSuggest, setShowSuggest] = useState(false);
const [showEmoji, setShowEmoji] = useState(false);
const emojiBtnRef = useRef<HTMLDivElement>(null);
const emojiPanelRef = useRef<HTMLDivElement>(null);
// İş yazılarında kullanılabilir “profesyonel” emoji seti
const PROFESSIONAL_EMOJIS = [
  '✅','⚖️','📦','🚢','📄','🧾','📈','📊','📌','🏷️','🗂️','📝','✉️','📬',
  '🏛️','🕒','⏳','📣','🔍','🔗','📚','💼','🤝','🌐','🇪🇺','🇹🇷'
];

const extensions = useMemo(() => [
  Document, Paragraph, Text,
  InlineQuote, 
  Bold, Italic, Strike,
     Link.configure({
     openOnClick: false,
     autolink: true,
     linkOnPaste: true,
     defaultProtocol: "https",
     HTMLAttributes: { rel: "noopener nofollow" },
   }),
  Heading.configure({ levels: [1,2,3,4,5,6] }),
  Blockquote,
  ListItem,            // ⬅️ listelerden önce
  BulletList.configure({ keepMarks: true }),
  OrderedList.configure({ keepMarks: true }),
  History,
  Dropcursor,
  Gapcursor,
  HardBreak,
  Placeholder.configure({ placeholder: effectivePlaceholder }),
   CharacterCount.configure({ limit: 10000 }),
  FloatImage.configure({ HTMLAttributes: { draggable: "true" } }),
 ], [effectivePlaceholder]);

  const editor = useEditor({
    extensions,
    content: value ?? { type: "doc", content: [{ type: "paragraph" }] },
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChange?.(editor.getJSON());
    },
    editorProps: {
      attributes: {
        // Not: .prose’yi ya burada ya wrapper’da ver; ikisi birden şart değil
        class: "prose max-w-none px-3 py-4 focus:outline-none",
      },
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (items) {
          for (const it of items) {
            if (it.kind === "file") {
              const f = it.getAsFile();
              if (f) {
                event.preventDefault();
                void uploadAndInsert(f);
                return true;
              }
            }
          }
        }
        const text = event.clipboardData?.getData("text");
        if (text && /^https?:\/\/.*\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(text.trim())) {
          event.preventDefault();
          editor?.chain().focus().setImage({ src: text.trim(), float: "none" } as any).run();
          return true;
        }
        return false;
      },
      handleDrop(view, event, _slice, moved) {
        const dragEvent = event as DragEvent;
        const { state, dispatch } = view;
        const editorRect = (view.dom as HTMLElement).getBoundingClientRect();

        const getFloatFromX = (clientX: number): "left" | "right" => {
          const x = clientX - editorRect.left;
          return x < editorRect.width / 2 ? "left" : "right";
        };

        // Bırakılan konuma göre paragrafı gerekirse böl
        const posAt = view.posAtCoords({ left: dragEvent.clientX, top: dragEvent.clientY });
        if (posAt) {
          const $pos = state.doc.resolve(posAt.pos);
          if ($pos.parent.isTextblock) {
            dispatch(state.tr.split(posAt.pos));
          }
        }

        // 1) Editör içinden image node sürükleniyorsa (moved===true):
        //    Default taşıma gerçekleşsin; sonrasında float'ı drop X’e göre güncelle.
        if (moved) {
          const targetFloat = getFloatFromX(dragEvent.clientX);
          setTimeout(() => {
            const { state, dispatch } = view;
            const sel = state.selection;
            const $cur = state.doc.resolve(sel.from);
            let updated = false;
            $cur.parent.forEach((node, offset) => {
              if (!updated && node.type.name === "image") {
                const pos = $cur.start() + offset;
                dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, float: targetFloat }));
                updated = true;
              }
            });
          }, 0);
          return false; // default move devam etsin
        }

        // 2) Dışarıdan dosya bırakılıyorsa:
        const files = dragEvent.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const img = Array.from(files).find((f) => f.type.startsWith("image/"));
        if (img) {
          dragEvent.preventDefault();
          const targetFloat = getFloatFromX(dragEvent.clientX);
          void uploadAndInsert(img, targetFloat);
          return true;
        }
        return false;
      },

    }, // editorProps kapandı
  });  // useEditor kapandı
const handlePickInternalLink = useCallback((href: string, displayText?: string) => {
  if (!editor) return;

  const { from, to, empty } = editor.state.selection;

  // 1) Eğer seçim var ise: seçimin etrafını link olarak işaretle
  if (!empty && to > from) {
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href })
      .run();
    return;
  }

  // 2) Seçim yoksa: verilen görünen metni yaz + geriye dönüp linkle
  const text = (displayText && displayText.trim().length >= 1) ? displayText.trim() : href;
  editor
    .chain()
    .focus()
    .insertContent(text)
    .command(({ tr, dispatch }) => {
      const start = tr.selection.from - text.length;
      const end = tr.selection.from;
      if (dispatch) {
        tr.addMark(start, end, editor.schema.marks.link.create({ href }));
      }
      return true;
    })
    .run();
}, [editor]);

useEffect(() => {
    if (!mounted || !editor) return;
    function onInternalLink(e: any) {
      const { url, label } = e.detail || {};
      handlePickInternalLink(url, label);
    }
    window.addEventListener("editor-internal-link", onInternalLink);
    return () => window.removeEventListener("editor-internal-link", onInternalLink);
  }, [mounted, editor, handlePickInternalLink]);
  const insertEmoji = useCallback((emoji: string) => {
  if (!editor) return;
  editor.chain().focus().insertContent(emoji + ' ').run();
  setShowEmoji(false);
}, [editor]);

useEffect(() => {
  function onDocMouseDown(e: MouseEvent) {
    const btn = emojiBtnRef.current;
    const panel = emojiPanelRef.current;
    const target = e.target as Node;
    if (!btn || !panel) return;
    if (btn.contains(target) || panel.contains(target)) return;
    setShowEmoji(false);
  }
  if (showEmoji) document.addEventListener("mousedown", onDocMouseDown);
  return () => document.removeEventListener("mousedown", onDocMouseDown);
}, [showEmoji]);

  const openFile = () => fileInputRef.current?.click();

 const uploadAndInsert = useCallback(async (file: File, float: "left" | "right" | "none" = "none") => {
    if (!editor) return;
    if (!effectivePostId) {
     alert(t("alertSaveFirst"));
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
	  fd.append("postId", effectivePostId);
      fd.set("file", file);
      fd.set("postId", String(postId ?? ""));

      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json?.ok || !json?.url) {
        console.error(json);
        alert(json?.error || t("uploadFailed"));
        return;
      }
      editor.chain().focus().setImage({ src: json.url, alt: file.name, float } as any).run();
    } finally {
      setUploading(false);
    }
 }, [editor, endpoint, effectivePostId]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white" suppressHydrationWarning>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        {/* Inline styles */}
{/* Inline styles */}
<button
  type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("bold") ? "bg-gray-200" : ""}`}
  onClick={() => editor?.chain().focus().toggleBold().run()}
  disabled={editor ? !editor.can().chain().focus().toggleBold().run() : true}
>
  B
</button>

<button
  type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("italic") ? "bg-gray-200" : ""}`}
  onClick={() => editor?.chain().focus().toggleItalic().run()}
  disabled={editor ? !editor.can().chain().focus().toggleItalic().run() : true}
>
  <i>I</i>
</button>

<button
  type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("strike") ? "bg-gray-200" : ""}`}
  onClick={() => editor?.chain().focus().toggleStrike().run()}
  disabled={editor ? !editor.can().chain().focus().toggleStrike().run() : true}
>
  S
</button>

{/* Paragraph / Headings */}
<button
  type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("paragraph") ? "bg-gray-200" : ""}`}
  onClick={() => editor?.chain().focus().setParagraph().run()}
  disabled={editor ? !editor.can().chain().focus().setParagraph().run() : true}
>
  P
</button>

<button
  type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("heading", { level: 2 }) ? "bg-gray-200" : ""}`}
  onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
  disabled={editor ? !editor.can().chain().focus().toggleHeading({ level: 2 }).run() : true}
>
  H2
</button>

<button
  type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("heading", { level: 3 }) ? "bg-gray-200" : ""}`}
  onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
  disabled={editor ? !editor.can().chain().focus().toggleHeading({ level: 3 }).run() : true}
>
  H3
</button>

{/* Lists */}
<button
  type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("bulletList") ? "bg-gray-200" : ""}`}
  onClick={() => editor?.chain().focus().toggleBulletList().run()}
  disabled={editor ? !editor.can().chain().focus().toggleBulletList().run() : true}
>
  {t("btnBulletList")}
</button>

<button
  type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("orderedList") ? "bg-gray-200" : ""}`}
  onClick={() => editor?.chain().focus().toggleOrderedList().run()}
  disabled={editor ? !editor.can().chain().focus().toggleOrderedList().run() : true}
>
 {t("btnOrderedList")}
</button>
{/* Image Float */}
<button
  type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("image", { float: "left" }) ? "bg-gray-200" : ""}`}
  onClick={() => editor && (editor.chain() as any).focus().setImageFloat("left").run()}
  disabled={!editor}
>
  Img ⬅
</button>
<button
  type="button"
   className="px-2 py-1 rounded-md"
  onClick={() => editor?.chain().focus().unsetLink().run()}
  disabled={!editor}
  title={t("btnUnlinkTitle")}
>
   {t("btnUnlink")}
</button>

 <button
   type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("link") ? "bg-gray-200" : ""}`}
   onClick={() => {
    const current = editor?.getAttributes("link")?.href ?? "";
   const href = prompt("Enter URL", current);
    if (href) editor?.chain().focus().extendMarkRange("link").setLink({ href, target: "_blank", rel: "noopener" }).run();
  }}
  disabled={!editor}
  title={t("btnLinkTitle")}
>
   {t("btnLink")}
 </button>

 <button
   type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("image", { float: "right" }) ? "bg-gray-200" : ""}`}

  onClick={() => editor && (editor.chain() as any).focus().setImageFloat("right").run()}
  disabled={!editor}
>
  Img ➡
</button>

<button
  type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("image", { float: "none" }) ? "bg-gray-200" : ""}`}
  onClick={() => editor && (editor.chain() as any).focus().setImageFloat("none").run()}
  disabled={!editor}
>
  Img ⏹
</button>

{/* Blockquote */}
<button
  type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("blockquote") ? "bg-gray-200" : ""}`}
  onClick={() => editor?.chain().focus().toggleBlockquote().run()}
  disabled={editor ? !editor.can().chain().focus().toggleBlockquote().run() : true}
>
  {t("btnBlockquote")}
</button>
<button
  type="button"
  className={`px-2 py-1 rounded-md ${editor?.isActive("inlineQuote") ? "bg-gray-200" : ""}`}
  onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleInlineQuote().run(); }}
>
 {t("btnInlineQuote")}
</button>

{/* Soft break */}
<button
  type="button"
  className="px-2 py-1 rounded-md"
  onClick={() => editor?.chain().focus().setHardBreak().run()}
  disabled={editor ? !editor.can().chain().focus().setHardBreak().run() : true}
>
  ↵
</button>

{/* Undo / Redo */}
<button
  type="button"
  className="px-2 py-1 rounded-md"
  onClick={() => editor?.chain().focus().undo().run()}
  disabled={editor ? !editor.can().chain().focus().undo().run() : true}
>
  ⟲ {t("btnUndo")}
</button>

<button
  type="button"
  className="px-2 py-1 rounded-md"
  onClick={() => editor?.chain().focus().redo().run()}
  disabled={editor ? !editor.can().chain().focus().redo().run() : true}
>
  ⟳ {t("btnRedo")}
</button>
<div className="relative" ref={emojiBtnRef}>
  <button
    type="button"
    className="px-2 py-1 rounded-md"
    title={t("btnEmojiTitle")}
    onClick={() => setShowEmoji((s) => !s)}
  >
    🙂
  </button>

  {showEmoji && (
    <div
      ref={emojiPanelRef}
      className="absolute z-20 mt-2 w-64 rounded-lg border bg-white p-2 shadow-lg grid grid-cols-8 gap-1"
    >
      {PROFESSIONAL_EMOJIS.map((emo) => (
        <button
          key={emo}
          type="button"
          className="text-xl leading-none hover:bg-gray-100 rounded-md p-1"
          onClick={() => insertEmoji(emo)}
        >
          {emo}
        </button>
      ))}
    </div>
  )}
</div>


        <div className="grow" />

        {/* Image input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadAndInsert(f);
            e.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
          onMouseDown={(e) => { e.preventDefault(); openFile(); }}
          disabled={uploading}
        >
         {uploading ? t("loading") : t("btnAddImage")}
        </button>
      </div>

      {/* Editor */}
            {/* Editor */}
    <div className="prose max-w-none px-3 py-4 min-h-[50vh] md:min-h-[50vh]">
      {mounted && editor && (
      <EditorContent
        editor={editor}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
           e.preventDefault();
             const current = editor?.getAttributes("link")?.href ?? "";
           const href = prompt("Enter URL", current);
             if (href) {
             editor?.chain().focus().extendMarkRange("link").setLink({ href, target: "_blank", rel: "noopener" }).run();
              }
           }
         }}
       />
    )}

     </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-3 py-2 text-sm text-gray-500">
          <span>{t("characters")}: {editor?.storage.characterCount.characters() ?? 0}</span>
       <span>{t("words")}: {editor?.storage.characterCount.words() ?? 0}</span>
		<div className="mt-2">
  <button
    type="button"
    className="rounded-md border px-3 py-1 text-sm"
    onClick={() => setShowSuggest(true)}
  >
    {t("btnSuggestLinks")}
  </button>
</div>
      </div>
	  {editor && (
  <LinkSuggestDrawer
    editor={editor}
    isOpen={showSuggest}
    onClose={() => setShowSuggest(false)}
    baseUrl={typeof window === "undefined" ? "" : window.location.origin}
    lang={String(locale).toLowerCase().startsWith("en") ? "en" : "tr"}
  />
)}
    </div>
  );
}
