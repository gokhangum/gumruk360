import ProfileForm from "@/components/worker-cv/ProfileForm";
import BlocksEditor from "@/components/worker-cv/BlocksEditor";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
export const dynamic = "force-dynamic";

export default async function WorkerCVPage() {

const tNav = await getTranslations("worker.nav");
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/worker/cv");

  // ensure role is worker (guard consistent with /worker layout)
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "worker") redirect("/login?next=/worker/cv");

  return (

      <div className="-mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 w-full max-w-none md:max-w-[928px]">
        <div className="card-surface shadow-colored rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
      <h1 className="text-xl font-semibold">{tNav("cvEdit")}</h1>
      <div className="rounded-2xl border border-gray-200 shadow-sm bg-white p-4 md:p-6 mb-6">
      <ProfileForm />
      </div>
	 <div className="rounded-2xl border border-gray-200 shadow-sm bg-white p-4 md:p-6">
      <BlocksEditor /></div>
    </div></div></div>
  );
}
