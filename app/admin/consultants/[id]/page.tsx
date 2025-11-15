import AdminProfileForm from "@/components/admin-consultants/AdminProfileForm";
import AdminBlocksEditor from "@/components/admin-consultants/AdminBlocksEditor";
import { supabaseServer } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminConsultantDetail(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();

  const { data: profile } = await supabase.from("profiles").select("id, email, role").eq("id", id).maybeSingle();
  if (!profile || !["worker", "worker360"].includes(profile.role)) notFound();

  return (
    <div className="p-4 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Danışman CV Düzenle (Admin)</h1>
        <div className="text-sm text-gray-600">{profile.email}</div>
      </div>
      <AdminProfileForm workerId={id} />
      <AdminBlocksEditor workerId={id} />
    </div>
  );
}
