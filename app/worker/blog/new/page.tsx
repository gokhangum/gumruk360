// app/worker/blog/new/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import BlogForm from "@/components/blog/BlogForm";
import { getTranslations } from "next-intl/server";
export const runtime = "nodejs";

export default async function Page() {
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user?.id) {
    // İstersen burada redirect/notFound yapabilirsin.
	return null;
  }

  // Worker profil bilgisi
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .eq("id", u!.user!.id)
    .single();
  // [EKLE] Full name'i admin tarafındaki gibi güvenli doldur
  const fullName =
    profile?.full_name ??
    (u.user.user_metadata?.full_name || u.user.user_metadata?.name) ??
    null;

  const currentUser = {
    id: u.user.id,
    full_name: fullName,
    email: profile?.email ?? u.user.email ?? null,
    avatar_url:
      profile?.avatar_url ??
      (u.user.user_metadata?.avatar_url || u.user.user_metadata?.picture) ??
      null,
  };

const t = await getTranslations("WorkerBlogNew");

  return (
   
  <div className="-mx-2 md:mx-0 px-0 md:px-5 pt-2 md:pt-3 pb-3 md:pb-5 w-full max-w-none md:max-w-[928px]">
    <div className="card-surface shadow-colored rounded-xl">
 
    <main className="max-w-5xl mx-auto p-4 md:p-6">
     <h1 className="text-xl font-semibold mb-4">{t("heading")}</h1>
     <BlogForm mode="create" role="worker" currentUser={currentUser as any} />
    </main>
	</div></div>
  );

}
