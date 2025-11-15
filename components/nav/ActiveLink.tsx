"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  href: string | { pathname: string; query?: Record<string, any> };
  children: React.ReactNode;
  /** For groups like /dashboard/questions and its subpages */
  startsWith?: boolean;
  /** Extra classes to add; base .sidenav .link are applied automatically */
  className?: string;
  /** (Projende varsa) variant desteği zaten ekliyse burada da kalsın */
  variant?: "sidenav" | "topnav";
} & React.AnchorHTMLAttributes<HTMLAnchorElement>;

export default function ActiveLink({ href, children, startsWith = false, variant = "sidenav", className = "", ...rest }: Props) {
  const pathname = usePathname();
  const isActive = (() => {
    if (!pathname) return false;
    try {
            const hrefPath =
        typeof href === "string"
          ? href.split("?")[0].split("#")[0]
          : ((href as any).pathname || "/");
      return startsWith ? pathname.startsWith(hrefPath) : pathname === hrefPath;
    } catch {
      return false;
    }
  })();

 const base = `${variant ?? "sidenav"} link`;
  const active = isActive ? "tab-active" : "tab-hover";
  const cls = [base, active, className].filter(Boolean).join(" ");

  return (
  <Link href={href as any} aria-current={isActive ? "page" : undefined} className={cls} {...rest}>

      {children}
    </Link>
  );
}
