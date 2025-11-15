"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Props = {
  sourcePrefix: string; // örn: "/admin/request/"
  targetPrefix: string; // örn: "/worker/editor/"
  children: React.ReactNode;
};

export default function LinkScopeRewriter({
  sourcePrefix,
  targetPrefix,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    function findAnchor(el: HTMLElement | null): HTMLAnchorElement | null {
      while (el && el !== root) {
        if (el instanceof HTMLAnchorElement) return el;
        el = el.parentElement as HTMLElement | null;
      }
      return null;
    }

    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0
      )
        return;

      const target = e.target as HTMLElement | null;
      const a = findAnchor(target);
      if (!a) return;

      const raw = a.getAttribute("href") || "";
      if (!raw) return;

      // dış linkler, anchorlar ve mutlak http linkler dokunulmaz
      if (raw.startsWith("http") || raw.startsWith("mailto:") || raw.startsWith("#")) return;

      // sadece istenen prefix'le başlayan linkleri çevir
      if (raw.startsWith(sourcePrefix)) {
        e.preventDefault();
        const replaced = raw.replace(sourcePrefix, targetPrefix);
        router.push(replaced);
      }
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [router, sourcePrefix, targetPrefix]);

  return <div ref={ref}>{children}</div>;
}
