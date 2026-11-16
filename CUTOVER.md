# Production cutover checklist (www.finalfinishepoxy.ca)

Do not run this against the preview host lightgrey-wasp-945457.hostingersite.com.
Do not cut over the domain until Matt explicitly says yes.

## On the production build, at cutover (not before)

1. Replace `robots.txt` with `robots.production.txt`. That file allows Googlebot, Bingbot, and AI crawlers (GPTBot, ChatGPT-User, Google-Extended, ClaudeBot, Claude-Web, Anthropic-Ai, PerplexityBot, Applebot-Extended, Bytespider, CCBot) and lists `Sitemap: https://www.finalfinishepoxy.ca/sitemap.xml`.
2. Remove the staging `meta name="robots" content="noindex,nofollow,noarchive"` from every page. Production should allow indexing (`index,follow` or omit the robots meta).
3. Remove the `.htaccess` line `Header always set X-Robots-Tag "noindex, nofollow"`.
4. Keep canonicals, Open Graph URLs, JSON-LD, and `sitemap.xml` on `https://www.finalfinishepoxy.ca` (already set).
5. Confirm DNS and HTTPS for www and the apex point at the new Hostinger site only after Matt's yes.

## Google Search Console (after the domain is serving this build)

1. Open the Domain property `kr8tiv.io` is not this site. Use the Final Finish properties for `finalfinishepoxy.ca` (Domain) and `https://www.finalfinishepoxy.ca/` (URL-prefix). Verify if they are not already verified (DNS TXT for the Domain property; the URL-prefix may already be verified).
2. Submit `https://www.finalfinishepoxy.ca/sitemap.xml`. Confirm it reports Success and 96 URLs (home, services, 21 town pages, 60 resource posts, plus the other core pages).
3. Request indexing on key templates first (home, /services, /contact, /resources, and one town page, one blog). Daily Request Indexing quota is account-wide.

## Bing Webmaster Tools

1. Verify `finalfinishepoxy.ca` if it is not already (the production `robots.txt` and the site will be crawlable after cutover).
2. Submit `https://www.finalfinishepoxy.ca/sitemap.xml`.

## IndexNow

1. Keep or add an IndexNow key file at the site root (for example `/<key>.txt` containing only the key).
2. POST the sitemap URLs to `https://api.indexnow.org/indexnow`, and also to Bing and Yandex IndexNow endpoints if used, with the key and host `www.finalfinishepoxy.ca`.
3. Confirm HTTP 200. Do not submit the preview host.

## After cutover checks

- Fetch `https://www.finalfinishepoxy.ca/robots.txt` and confirm it is the production file, not `Disallow: /`.
- Fetch a page and confirm there is no `noindex` meta and no `X-Robots-Tag: noindex`.
- Confirm `https://www.finalfinishepoxy.ca/sitemap.xml` and `https://www.finalfinishepoxy.ca/llms.txt` load.
- Spot-check home, a blog, and the blog index on desktop and a phone width.
