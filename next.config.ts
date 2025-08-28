/** @type {import('next').NextConfig} */
const nextConfig = {
  i18n: {
    // Sitede kullanacağın diller:
    locales: ['tr', 'en'],
    defaultLocale: 'tr',
    // Domain tabanlı dil eşlemesi:
    domains: [
      { domain: 'gumruk360.com', defaultLocale: 'tr' },
      { domain: 'www.gumruk360.com', defaultLocale: 'tr' },
      { domain: 'tr.easycustoms360.com', defaultLocale: 'en' }
    ],
  },
};

module.exports = nextConfig;

