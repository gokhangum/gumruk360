# SEO Regression Checklist (Monthly, 10 URLs)

## URLs
- /
- /about
- /contact
- /legal
- /faq
- /blog (varsa)
- /dashboard/how-it-works (noindex beklenir)
- /sitemap.xml
- /robots.txt
- (serbest bir hizmet sayfası)

## Her URL için kontrol
- [ ] HTTP 200 (veya hedefte 301/308 → tek adımda 200; zincir/loop yok)
- [ ] `<link rel="canonical">` var ve **tek**
- [ ] `hreflang` (tr-TR, en, x-default) doğru ve **karşılıklı**
- [ ] `<meta name="description">` var
- [ ] `noindex`: yalnızca iç/kontrol paneli sayfalarında (örn. `/dashboard/*`)
- [ ] Open Graph: `og:url ≡ canonical`, `og:site_name` doğru
- [ ] `robots.txt` erişimi ve içerik doğru (ortama göre)
- [ ] `sitemap.xml` erişimi ve doğru URL’ler (404/301 yok)
