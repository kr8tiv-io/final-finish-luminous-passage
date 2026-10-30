# Final Finish Epoxy website: how to move it

## What this is
- **Live preview of this exact build:** https://lightgrey-wasp-945457.hostingersite.com (a temporary Hostinger address)
- **This folder:** the complete source code for that site, including all images and 3D models.
- The domain finalfinishepoxy.ca still shows the old Squarespace site until its DNS is pointed at the new host.

## Option A: upload the finished site (easiest)
1. Install Node.js 22 or newer (https://nodejs.org).
2. In this folder, run:
   - `npm install`
   - `npm run build:staging`
   - `npm run package:static-preview`
3. The ready-to-upload site is in `dist/static-preview/` (a zip of it is made too).
4. Upload everything in that folder, including the hidden `.htaccess` files, to your host's web root (usually `public_html`).
5. Check it on the new host's temporary address before touching the domain.

Note: the static version has no server, so the quote form shows a "call" message instead of sending. To make the form send, deploy the full Node build (`npm run build:production`, then run the server in `dist/server`) on a host that supports Node.js. See README.md.

## Option B: host it on any Node.js host
Run `npm install` and `npm run build:production`, then run `node dist/server/entry.mjs` on the host. README.md has more detail.

## Point finalfinishepoxy.ca at the new host
1. In Squarespace, go to Domains, then finalfinishepoxy.ca, then DNS settings.
2. Change the A record (and the `www` CNAME) to the values your new host gives you, or switch the nameservers to the new host.
3. Leave the email (MX) records alone so email keeps working.
4. DNS can take a few hours, up to 48, to update.
5. Turn on the free SSL (https) in the new host's control panel once the domain points there.
6. Once the new site is live, the Squarespace website plan can be cancelled. The domain can stay registered at Squarespace.
