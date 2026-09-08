import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = () => Response.json(
  {
    status: 'ok',
    service: 'final-finish-epoxy',
    timestamp: new Date().toISOString(),
  },
  {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  },
);
