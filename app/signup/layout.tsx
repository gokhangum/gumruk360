import type { ReactNode } from "react";
import MarketingLayout from "@/components/layout/MarketingLayout";

export default function SignupLayout({ children }: { children: ReactNode }) {
  return <MarketingLayout>{children}</MarketingLayout>;
}