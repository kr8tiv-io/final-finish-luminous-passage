import { z } from 'zod';

export const quoteRequestSchema = z.object({
  location: z.string().trim().min(2).max(120),
  spaceType: z.enum(['garage', 'barn', 'workshop', 'other-residential', 'warehouse', 'showroom', 'industrial']),
  sizeBand: z.enum(['single-car', 'two-car', 'three-plus-car', 'under-1000', 'over-1000', 'unknown']),
  conditions: z.array(z.enum(['cracks', 'pitting', 'oil', 'old-coating', 'road-salt', 'moisture', 'not-sure'])).max(7),
  finishInterest: z.enum(['flake', 'solid', 'metallic', 'not-sure']),
  timeline: z.enum(['as-soon-as-possible', '1-3-months', '3-6-months', 'researching']),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().pipe(z.email().max(180)),
  phone: z.string().trim().min(7).max(30),
  contactPreference: z.enum(['phone', 'email', 'text']),
  consent: z.literal(true),
  website: z.string().max(0).optional(),
  visualizerFinishId: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
  photos: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    type: z.literal('image/jpeg'),
    data: z.string().startsWith('data:image/jpeg').max(900_000),
  })).max(6).optional(),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
