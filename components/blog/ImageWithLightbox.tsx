"use client";
import React from "react";
import { useLightbox } from "./LightboxProvider";

type Props = {
  src: string;
  alt?: string;
  /** Aynı makaledeki tüm görseller için dizi ve kendi index’in */
  gallery?: { src: string; alt?: string }[];
  index?: number;
  className?: string;
};

export default function ImageWithLightbox({ src, alt, gallery, index = 0, className }: Props) {
  const lb = useLightbox();
  const onClick = () => lb.open(gallery && gallery.length ? gallery : [{ src, alt }], index);

  return (
    <button
      type="button"
      className={`group relative cursor-zoom-in ${className || ""}`}
      onClick={onClick}
      aria-label="Open image in lightbox"
    >
      {/* Burada istersen next/image de kullanabilirsin */}
      <img src={src} alt={alt || ""} className="w-full h-auto rounded-lg" />
      <span className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-transparent group-hover:ring-white/40 transition" />
    </button>
  );
}
