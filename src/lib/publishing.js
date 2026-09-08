/** A draft may be previewed outside production, but it is never publishable. */
import { requireSiteEnvironment } from './deployment.js';

export function resourcePath(entry) {
	return `/resources/${entry.id}/`;
}

export function canPublish(entry) {
	if (entry.data.draft === true) return false;
	const status = entry.data.reviewStatus;
	if (!status) return true;
	return ['approved', 'published'].includes(status);
}

export function visibleResources(entries, environment = 'development') {
	return environment === 'production' ? entries.filter(canPublish) : entries;
}

export function resourcesForDeployment(entries, siteEnvironment) {
	return visibleResources(entries, requireSiteEnvironment(siteEnvironment));
}

export function relatedEntries(entry, entries, environment = 'development') {
	const visible = visibleResources(entries, environment);
	return entry.data.relatedResources
		.map((id) => visible.find((candidate) => candidate.id === id))
		.filter(Boolean);
}
