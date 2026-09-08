import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const sourceSchema = z.object({
	name: z.string(),
	url: z.url(),
	publisher: z.string(),
	note: z.string().optional(),
});

const reviewWorkflowSchema = z.object({
	owner: z.string(),
	steps: z.array(z.string()).min(1),
	factChecks: z.array(z.string()).default([]),
});

const sharedSchema = z.object({
	title: z.string().min(29).max(33),
	description: z.string().min(150).max(160),
	intent: z.enum(['informational', 'commercial-investigation', 'transactional']),
	category: z.enum(['planning', 'preparation', 'materials', 'maintenance', 'commercial', 'local-guide', 'glossary']),
	primaryService: z.enum(['epoxy-flooring', 'concrete-polishing', 'garage-floor-coatings', 'commercial-flooring', 'floor-repair', 'neutral-material-education']),
	sources: z.array(sourceSchema).min(1),
	reviewer: z.string(),
	reviewerWorkflow: reviewWorkflowSchema,
	reviewWorkflow: reviewWorkflowSchema.optional(),
	relatedResources: z.array(z.string()).default([]),
	draft: z.boolean().default(true),
	reviewStatus: z.enum(['needs-review', 'in-review', 'approved', 'published']).default('needs-review'),
	updatedAt: z.coerce.date(),
});

const resources = defineCollection({
	loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/resources' }),
	schema: sharedSchema,
});

// Projects are intentionally not registered until there is approved project content.
// This prevents Astro's empty-glob warning and avoids publishing placeholder case studies.
export const collections = { resources };
