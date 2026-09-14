import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const directory = 'src/content/resources';
const files = (await readdir(directory)).filter((name) => name.endsWith('.mdx')).sort();
const failures = [];
const ids = new Set(files.map((name) => name.replace(/\.mdx$/, '')));
const titles = new Map();
const bodyHashes = new Map();
const requiredFields = ['title:', 'description:', 'intent:', 'category:', 'primaryService:', 'sources:', 'reviewer:', 'reviewerWorkflow:', 'relatedResources:', 'draft:', 'reviewStatus:', 'updatedAt:'];

for (const name of files) {
  const raw = await readFile(join(directory, name), 'utf8');
  const parts = raw.split('---');
  if (parts.length < 3) { failures.push(`${name}: missing frontmatter`); continue; }
  const [frontmatter, body] = [parts[1], parts.slice(2).join('---')];
  for (const field of requiredFields) if (!frontmatter.includes(field)) failures.push(`${name}: missing ${field}`);
  const title = /^title: "(.+)"$/m.exec(frontmatter)?.[1];
  if (!title) failures.push(`${name}: missing title`);
  else if (titles.has(title)) failures.push(`${name}: duplicate title with ${titles.get(title)}`);
  else titles.set(title, name);
  const sourceUrls = [...frontmatter.matchAll(/^\s+url: "(https?:\/\/[^"\s]+)"$/gm)].map((match) => match[1]);
  if (!sourceUrls.length) failures.push(`${name}: has no source URLs`);
  for (const url of sourceUrls) if (!body.includes(`](${url})`)) failures.push(`${name}: source URL is not cited inline: ${url}`);
  const related = /^relatedResources: \[(.*)\]$/m.exec(frontmatter)?.[1].match(/"([^"]+)"/g)?.map((value) => value.slice(1, -1)) ?? [];
  for (const id of related) if (!ids.has(id)) failures.push(`${name}: unknown related resource ${id}`);
  const normalized = body.toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  if (bodyHashes.has(normalized)) failures.push(`${name}: duplicate body with ${bodyHashes.get(normalized)}`);
  else bodyHashes.set(normalized, name);
  const headings = [...body.matchAll(/^##+\s+(.+)$/gm)].map((match) => match[1].trim());
  if (!headings.length || headings.some((heading) => !heading)) failures.push(`${name}: needs a non-empty reader-facing section heading`);
  const sections = body.split(/^##+\s+.+$/gm).slice(1);
  if (!sections.some((section) => /[\p{L}]{2,}/u.test(section))) failures.push(`${name}: needs explanatory prose beneath a section heading`);
}

if (files.length !== 50) failures.push(`expected exactly 50 resources, found ${files.length}`);
if (failures.length) throw new Error(`Content validation failed:\n${failures.join('\n')}`);
console.log(`${files.length} resources validated: unique titles, source alignment, internal links, review metadata, and reader-purpose structure.`);
