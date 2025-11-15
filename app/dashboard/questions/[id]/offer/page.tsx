import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function OfferAliasRedirect({ params }: { params: { id: string } }) {
  // /offer yoluna gelenleri mevcut sayfaya yönlendir
  redirect(`/dashboard/questions/${params.id}`);
}
