import type { APIRoute } from 'astro';
import { isSameOriginBrowserRequest } from '../../../lib/security/request-guards';
import { issueVisualizerSession, VISUALIZER_SESSION_MAX_AGE_MS } from '../../../lib/visualizer/session';

export const prerender = false;

export const GET: APIRoute = ({ request, clientAddress }) => {
  if (!isSameOriginBrowserRequest(request)) {
    return Response.json({ code: 'VISUALIZER_SESSION_REQUIRED' }, { status: 403 });
  }

  return Response.json({
    token: issueVisualizerSession(clientAddress || 'unknown'),
    expiresInSeconds: VISUALIZER_SESSION_MAX_AGE_MS / 1_000,
  }, {
    headers: { 'cache-control': 'no-store' },
  });
};
