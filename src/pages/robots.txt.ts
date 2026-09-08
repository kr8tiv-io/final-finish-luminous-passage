import type { APIRoute } from 'astro';
import { deploymentSettings, robotsText } from '../lib/deployment.js';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
	const deployment = deploymentSettings(import.meta.env.SITE_ENV, site);
	return new Response(robotsText(deployment), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
