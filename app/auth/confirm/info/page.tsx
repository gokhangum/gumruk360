"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useTranslations } from "next-intl";
export default function ConfirmInfoPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient();
const t = useTranslations("auth.confirmInfo");
  // Welcome e-postasını yalnızca bir kez tetiklemek için
  const welcomeSentRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) Önce hash (#access_token/refresh_token) varsa işlesin
        await supabase.auth.getSession().catch(() => {});

        // 2) Hash yoksa ve query'de 'code' geldiyse (PKCE / verify redirect)
        if (!cancelled) {
          const code = sp.get("code");
          if (code) {
            try {
              await supabase.auth.exchangeCodeForSession(code);
            } catch {
              /* yoksay: bazı akışlarda geçerli olmayabilir */
            }
          }
        }

        // 3) Hash yoksa ve query'de 'token_hash' + 'type' geldiyse (email verify - signup)
        if (!cancelled) {
          const token_hash = sp.get("token_hash");
          const type = sp.get("type") as any; // 'signup' | 'invite' | 'magiclink' | 'recovery' | ...
          if (token_hash && type) {
            try {
              await supabase.auth.verifyOtp({ token_hash, type });
            } catch {
              /* yoksay */
            }
          }
        }

        if (cancelled) return;

        // 4) Kullanıcıyı al
        const { data: userRes } = await supabase.auth.getUser().catch(() => ({ data: { user: null } as any }));
        const user = userRes?.user ?? null;

        // 5) Welcome e-postasını tetikle (sadece 1 kez)
        if (!welcomeSentRef.current && user?.email) {
          welcomeSentRef.current = true;

          const email = user.email as string;
          const fullName =
            (user.user_metadata?.full_name as string | undefined) ||
            (user.user_metadata?.name as string | undefined) ||
            "";

          // Dil: ?lang parametresi öncelikli; yoksa tarayıcıdan TR/EN tahmini
          const langParam = (sp.get("lang") || "").toLowerCase();
          const langGuess =
            langParam === "en" || langParam === "tr"
              ? langParam
              : (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en"))
              ? "en"
              : "tr";

          try {
            await fetch("/api/auth/welcome/send", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-lang": langGuess,
              },
              body: JSON.stringify({ email, name: fullName }),
            });
          } catch {
            // Welcome gönderimi başarısız olsa da akışı durdurma
          }
        }

        if (cancelled) return;

        // 6) Yönlendirme kuralı
        const next = sp.get("next") || "/redirect/me";

        if (user) {
          // Oturum var: güvenli hedefe gönder
          router.replace(next);
        } else {
          // Oturum yok: login'e yönlendir (next korunur)
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        }
      } catch {
        // Beklenmedik durumda login'e gönder
        const next = sp.get("next") || "/redirect/me";
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, sp, supabase]);

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-lg font-semibold mb-2">{t("title")}</h1>
      <p className="text-sm text-gray-700">
        {t("desc_redirect")}
      </p>
    </main>
  );
}
