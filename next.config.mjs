// next.config.mjs
import createNextIntlPlugin from 'next-intl/plugin'

// i18n plugin — default olarak i18n/request.ts okunur
const withNextIntl = createNextIntlPlugin()

  /** @type {import('next').NextConfig} */
  const nextConfig = {
    reactStrictMode: true,
    // serverActions: {  bodySizeLimit: "20mb"  },
     images: {
      domains: ["utbgmxcuokaeyohgftwx.supabase.co"], // Supabase Storage hostu
      formats: ["image/avif", "image/webp"]
     },
     async headers() {
      return [
        {
         source: "/(.*)",
          headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
           { key: "X-Content-Type-Options", value: "nosniff" },
           { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
          ],
        },
      ];
    },
    async redirects() {
      return [
       {
          source: "/:path*",
        has: [{ type: "host", value: "gumruk360.com" }],
         destination: "https://www.gumruk360.com/:path*",
         permanent: true, // 308
       },
      ];
    },
   turbopack: {},
   eslint: {
    ignoreDuringBuilds: true
   }
  }

export default withNextIntl(nextConfig)
