"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { pushPageContext } from "@/lib/datalayer";

type Props = {
  host?: string;
  tenant?: string;
  locale?: string;
  userRole?: string;
};

export default function PageContextTracker({ host, tenant, locale, userRole }: Props) {
  const pathname = usePathname() || "/";

  useEffect(() => {
    pushPageContext({
      host,
      tenant,
      locale,
      userRole,
      path: pathname,
    });
  }, [host, tenant, locale, userRole, pathname]);

  return null;
}
