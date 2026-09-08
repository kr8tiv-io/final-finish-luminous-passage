import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resourcesForDeployment } from '../src/lib/publishing.js';

async function currentResources() {
	const files = await readdir('src/content/resources');
	return Promise.all(files.filter((file) => file.endsWith('.mdx')).map(async (file) => {
		const raw = await readFile(`src/content/resources/${file}`, 'utf8');
		return {
			id: file.replace(/\.mdx$/, ''),
			data: {
				draft: /^draft: true$/m.test(raw),
				reviewStatus: /^reviewStatus: "([^"]+)"$/m.exec(raw)?.[1],
			},
		};
	}));
}

test('production emits every published guide', async () => {
	const resources = await currentResources();
	assert.equal(resources.length, 50);
	assert.equal(resources.filter((entry) => entry.data.draft).length, 0);
	assert.equal(resourcesForDeployment(resources, 'production').length, 50);
});
