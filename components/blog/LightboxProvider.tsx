"use client";
import React, { createContext, useContext, useMemo, useState, useCallback } from "react";

type Item = { src: string; alt?: string };
type Ctx = {
  open: (items: Item[], index: number) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  isOpen: boolean;
  items: Item[];
  index: number;
};
const LightboxCtx = createContext<Ctx | null>(null);

export function useLightbox() {
  const ctx = useContext(LightboxCtx);
  if (!ctx) throw new Error("useLightbox must be used within LightboxProvider");
  return ctx;
}

export default function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);

  const open = useCallback((arr: Item[], i: number) => {
    setItems(arr);
    setIndex(i);
    setOpen(true);
    // body scroll lock (basit)
    if (typeof document !== "undefined") document.body.style.overflow = "hidden";
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    if (typeof document !== "undefined") document.body.style.overflow = "";
  }, []);
  const next = useCallback(() => setIndex((i) => (items.length ? (i + 1) % items.length : 0)), [items.length]);
  const prev = useCallback(() => setIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0)), [items.length]);

  // ESC / ok tuşları
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close, next, prev]);

  const value = useMemo<Ctx>(() => ({ open, close, next, prev, isOpen, items, index }), [open, close, next, prev, isOpen, items, index]);

  return (
    <LightboxCtx.Provider value={value}>
      {children}
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center"
          role="dialog" aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={items[index]?.src}
              alt={items[index]?.alt || ""}
              className="max-h-[90vh] max-w-[90vw] object-contain select-none"
              draggable={false}
            />
            {/* Prev */}
            <button onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-2 bg-white/20 hover:bg-white/30"
              aria-label="Previous">
              ‹
            </button>
            {/* Next */}
            <button onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 bg-white/20 hover:bg-white/30"
              aria-label="Next">
              ›
            </button>
            {/* Close */}
            <button onClick={close}
              className="absolute -right-3 -top-3 rounded-full h-8 w-8 bg-white text-black text-sm font-semibold"
              aria-label="Close">
              ×
            </button>
          </div>
        </div>
      )}
    </LightboxCtx.Provider>
  );
}
