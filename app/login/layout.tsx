import type { ReactNode } from "react";
import MarketingLayout from "@/components/layout/MarketingLayout";

/**
 * Wraps /login with the same marketing header & footer used on /signup.
 */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return <MarketingLayout>{children}</MarketingLayout>;
}