"use client";
import React, { useState } from "react";

 export default function ImageLightbox({
  children,
 }: { children: (open: (src: string, alt?: string) => void) => React.ReactNode }) {
  const [src, setSrc] = useState<string | null>(null);
  const [alt, setAlt] = useState<string | undefined>(undefined);

  const open = (s: string, a?: string) => { setSrc(s); setAlt(a); };
  const close = () => setSrc(null);

  return (
    <>
      {children(open)}
      {src && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
          onClick={close}
        >
          <img
            src={src}
            alt={alt || ""}
            className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
