import { z } from 'zod';
import { finishPresets } from '../visualizer/finishes';
import { isBoundedJpegDataUrl, QUOTE_PHOTO_BYTES, QUOTE_PHOTO_COUNT, JPEG_DATA_PREFIX } from './limits';

export const quoteRequestSchema = z.object({
  location: z.string().trim().min(2).max(120),
  spaceType: z.enum(['garage', 'basement', 'barn', 'workshop', 'other-residential', 'warehouse', 'showroom', 'industrial']),
  sizeBand: z.enum(['single-car', 'two-car', 'three-plus-car', 'under-1000', 'over-1000', 'unknown']),
  conditions: z.array(z.enum(['cracks', 'pitting', 'oil', 'old-coating', 'road-salt', 'moisture', 'not-sure'])).max(7),
  finishInterest: z.enum(['flake', 'solid', 'metallic', 'not-sure']),
  timeline: z.enum(['as-soon-as-possible', '1-3-months', '3-6-months', 'researching']),
  name: z.string().trim().min(2).max(100),
  email: z.union([z.literal(''), z.string().trim().pipe(z.email().max(180))]).default(''),
  phone: z.string().trim().max(30).refine((value) => !value || /^[+\d\s().-]+$/.test(value) && value.replace(/\D/g, '').length >= 7, 'Enter a usable phone number.').default(''),
  contactPreference: z.enum(['phone', 'email', 'text']),
  consent: z.literal(true),
  website: z.string().max(0).optional(),
  visualizerFinishId: z.string().trim().max(80).refine((id) => !id || finishPresets.some((finish) => finish.id === id), 'Choose a listed inspiration finish.').optional(),
  notes: z.string().trim().max(2000).optional(),
  photos: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    type: z.literal('image/jpeg'),
    data: z.string().max(JPEG_DATA_PREFIX.length + Math.ceil(QUOTE_PHOTO_BYTES / 3) * 4).refine(isBoundedJpegDataUrl, 'Photos must be normalized JPEGs of 256 KiB or less.'),
  })).max(QUOTE_PHOTO_COUNT).optional(),
}).superRefine((request, context) => {
  if (request.contactPreference === 'email' && !request.email) context.addIssue({ code: 'custom', path: ['email'], message: 'Enter an email address so Denis can reply.' });
  if (request.contactPreference !== 'email' && !request.phone) context.addIssue({ code: 'custom', path: ['phone'], message: 'Enter a phone number for a call or text.' });
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
