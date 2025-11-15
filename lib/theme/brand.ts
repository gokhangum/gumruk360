// lib/theme/brand.ts
import { headers } from "next/headers";

export type BrandInfo = {
  name: string;
  primary: string;   // background color
  foreground: string; // text color
};

export async function resolveBrand(): Promise<BrandInfo> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").toLowerCase();

  // gumruk360.com → TR brand
  const isTR = host.endsWith("gumruk360.com") || host.includes("localhost:3000");

  if (isTR) {
    return {
      name: "Gümrük 360",
      primary: "#0B3A82",
      foreground: "#FFFFFF"
    };
  }
  // default EN / easycustoms
  return {
    name: "Easycustoms 360",
    primary: "#0F766E",
    foreground: "#FFFFFF"
  };
}
