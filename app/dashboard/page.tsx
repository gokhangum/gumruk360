// 1) app/dashboard/page.tsx — Dashboard ana sayfa: /ask'a yönlendir
import { redirect } from "next/navigation";

export default function DashboardIndex() {
  redirect("/ask");
}
