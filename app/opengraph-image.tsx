import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { resolveBrand } from "@/lib/theme/brand";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  const t = await getTranslations("marketing");
  const brand = await resolveBrand();

  const title = t("og.title");
  const subtitle = t("og.subtitle");

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
          fontSize: 64,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 72 }}>{title}</div>
        <div style={{ marginTop: 16, opacity: 0.9, fontSize: 28 }}>{subtitle}</div>
      </div>
    ),
    size
  );
}
