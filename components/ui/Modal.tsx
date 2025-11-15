"use client";

import { useEffect, useRef } from "react";

type ModalProps = {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  widthClassName?: string; // örn: "max-w-2xl"
};

export default function Modal({ open, onClose, children, widthClassName = "max-w-2xl" }: ModalProps) {
	const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
	
     const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) onClose();
    };
    document.addEventListener("keydown", onKey);

    // Açılışta paneli veya ilk odaklanabilir öğeyi odakla
    const toFocus =
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ||
       panelRef.current;
     toFocus?.focus?.();

    return () => { document.body.style.overflow = original; };
	document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
     <div
       className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
     onClick={() => onClose?.()}
    >
      <div
        ref={panelRef}
       tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`w-[92%] ${widthClassName} rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 max-h-[90vh] flex flex-col`}
      >
        <div className="p-6 overflow-y-auto min-h-0">{children}</div>
        {onClose && (
          <button
            className="absolute right-3 top-3 rounded-full p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Kapat"
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
