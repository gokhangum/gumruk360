// next.config.ts  —  i18n/domains KALDIRILDI
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // i18n/domains kullanmıyoruz; dili host'tan (app/locale.ts) tespit ediyoruz.
};

export default nextConfig;
