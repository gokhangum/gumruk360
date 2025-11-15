import { ImageResponse } from "next/og";
import { resolveBrand } from "@/lib/theme/brand";

export const runtime = "edge";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default async function AppleIcon() {
  const brand = await resolveBrand();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: brand.primary,
          color: brand.foreground,
          fontSize: 72,
          fontWeight: 800,
        }}
      >
        {brand.name.startsWith("Gümrük") ? "G" : "E"}
      </div>
    ),
    { ...size }
  );
}
