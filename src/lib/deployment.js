const siteEnvironments = new Set(['staging', 'production']);

export const PRODUCTION_ORIGIN = 'https://www.finalfinishepoxy.ca';

export function requireSiteEnvironment(value) {
	if (!siteEnvironments.has(value)) {
		throw new Error('SITE_ENV must be either "staging" or "production".');
	}
	return value;
}

export function deploymentSettings(siteEnvironment, siteUrl) {
	const environment = requireSiteEnvironment(siteEnvironment);
	let site;
	try {
		site = new URL(siteUrl);
	} catch {
		throw new Error('PUBLIC_SITE_URL must be an absolute URL.');
	}
	if (!['http:', 'https:'].includes(site.protocol)) {
		throw new Error('PUBLIC_SITE_URL must use http or https.');
	}
	const crawlAllowed = environment === 'production';
	// Staging previews keep PUBLIC_SITE_URL as the temp host for assets/OG,
	// but canonicals always name production so we never advertise the temp host.
	const canonicalOrigin = environment === 'staging' ? new URL(PRODUCTION_ORIGIN) : site;
	return { environment, site, canonicalOrigin, noindex: !crawlAllowed, crawlAllowed };
}

export function astroAllowedDomain(deployment) {
	return {
		protocol: deployment.site.protocol.slice(0, -1),
		hostname: deployment.site.hostname,
		...(deployment.site.port ? { port: deployment.site.port } : {}),
	};
}

export function robotsText(deployment) {
	if (!deployment.crawlAllowed) {
		return 'User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /\n';
	}
	return `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', deployment.site)}\n`;
}