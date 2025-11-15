import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { resolveBrand } from "@/lib/theme/brand";

export const runtime = "edge";
export const size = { width: 1200, height: 600 };
export const contentType = "image/png";

export default async function TwitterImage() {
  const t = await getTranslations("marketing");
  const brand = await resolveBrand();

  const title = t("twitter.title");
  const subtitle = t("twitter.subtitle");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: brand.primary,
          color: brand.foreground,
          fontSize: 56,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 68 }}>{title}</div>
        <div style={{ marginTop: 12, opacity: 0.9, fontSize: 26 }}>{subtitle}</div>
      </div>
    ),
    size
  );
}
