// components/payments/PaddleBoot.tsx
"use client";

import { useEffect } from "react";

declare global { interface Window { Paddle?: any } }

export default function PaddleBoot() {
  useEffect(() => {
    let mounted = true;

    async function load() {
      // SDK yoksa yükle
      if (!window.Paddle) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("paddle_js_failed"));
          document.head.appendChild(s);
        });
      }

      if (!mounted || !window.Paddle) return;

       const envRaw =
     (process.env.NEXT_PUBLIC_PADDLE_ENV as string) ||
       (process.env.PADDLE_ENV as string) ||
        "sandbox";
      const isLive = envRaw.toLowerCase() === "live";
      try { window.Paddle.Environment.set(isLive ? "production" : "sandbox"); } catch {}
     const token = isLive
      ? ((process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_LIVE as string) ||
         (process.env.PADDLE_CLIENT_TOKEN_LIVE as string) || "")
      : ((process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN as string) ||
          (process.env.PADDLE_CLIENT_TOKEN_SANDBOX as string) || "");
    if (token) {
       try { window.Paddle.Initialize({ token }); } catch {}
     }

      // Hızlı debug
      try {
        console.log("[paddle:boot] lib", window.Paddle?.Status?.libraryVersion);
        console.log("[paddle:boot] env", window.Paddle?.Environment.get?.());
      } catch {}
    }

    load();
    return () => { mounted = false; };
  }, []);

  return null;
}
