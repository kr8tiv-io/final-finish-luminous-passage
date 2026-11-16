# Production cutover (www.finalfinishepoxy.ca)

Matt approved the domain cutover on 16 Nov 2026 at 2:35 PM America/Costa_Rica.
This branch is the production build. Do not deploy it to the preview host
lightgrey-wasp-945457.hostingersite.com. That host stays as the noindex staging
copy and the restore target.

## What this build already has

1. `robots.txt` allows Googlebot, Bingbot, and AI crawlers, and lists
   `Sitemap: https://www.finalfinishepoxy.ca/sitemap.xml`.
2. The staging `noindex,nofollow,noarchive` robots meta is removed from every page.
3. The `.htaccess` `X-Robots-Tag: noindex, nofollow` header is removed.
4. Canonicals, Open Graph URLs, JSON-LD, and `sitemap.xml` stay on
   `https://www.finalfinishepoxy.ca`. That is the hostname the current
   Squarespace site already 301s to, and it is the best way to carry over
   existing search listings. The apex `https://finalfinishepoxy.ca/` 301s to www.
5. 301 redirects from the old Squarespace URLs:
   - `/home` to `/`
   - `/blog` and `/blog/why-choose-epoxy-flooring` to `/resources`
   - `/blog/decorative-options-for-epoxy-flooring` to `/finishes`
   - `/blog/our-epoxy-flooring-process-from-estimate-to-finish` to `/process`
   - `/new-dropdown` to `/services`
   - `/cart` to `/`
   `/about`, `/contact`, `/services`, `/projects`, and the three service
   child pages already exist at the same paths.

## After DNS is pointed at Hostinger

1. Install SSL and turn on the HTTPS redirect (the certificate cannot be
   issued until the domain resolves to Hostinger).
2. Submit `https://www.finalfinishepoxy.ca/sitemap.xml` in Google Search
   Console and Bing Webmaster Tools (96 URLs).
3. IndexNow can be added then. Do not submit the preview host.
4. Redirect `https://lightgrey-wasp-945457.hostingersite.com/` to
   `https://www.finalfinishepoxy.ca/` only after the public domain is serving
   this build. Doing it earlier would send preview traffic to the old
   Squarespace site.

## Quote form

The contact form posts to `/api/quote`. That endpoint is an Astro Node
handler (`src/pages/api/quote.ts`) and is not part of this static export.
It already returned 404 on the staging host. Mail goes to
finalfinishepoxy@gmail.com once a Node or PHP endpoint with SMTP or Resend
is in place. The visible mailto and phone links still work.
