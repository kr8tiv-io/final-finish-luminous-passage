import type { QuoteRequest } from './schema';
import { finishPresets } from '../visualizer/finishes';

const labels: Record<string, string> = {
  'other-residential': 'other residential space',
  'single-car': 'single-car garage',
  'two-car': 'two-car garage',
  'three-plus-car': 'three-plus-car garage',
  'under-1000': 'commercial under 1,000 sq. ft.',
  'over-1000': 'commercial over 1,000 sq. ft.',
  'not-sure': 'not sure',
  'old-coating': 'old coating',
  'road-salt': 'road salt',
  'as-soon-as-possible': 'as soon as possible',
  '1-3-months': 'within 1–3 months',
  '3-6-months': 'within 3–6 months',
};

const humanize = (value: string) => labels[value] ?? value.replaceAll('-', ' ');
const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export function createQuoteReference(isoDate = new Date().toISOString(), random = crypto.randomUUID().replaceAll('-', '')): string {
  const date = isoDate.slice(2, 10).replaceAll('-', '');
  return `FFE-${date}-${random.slice(0, 6).toUpperCase()}`;
}

export function buildQuoteEmail(request: QuoteRequest, reference: string) {
  const finish = finishPresets.find((entry) => entry.id === request.visualizerFinishId);
  const details = [
    ['Reference', reference],
    ['Location', request.location],
    ['Space', humanize(request.spaceType)],
    ['Size', humanize(request.sizeBand)],
    ['Visible condition', request.conditions.length ? request.conditions.map(humanize).join(', ') : 'none selected'],
    ['Finish interest', humanize(request.finishInterest)],
    ['Timing', humanize(request.timeline)],
    ['Contact preference', humanize(request.contactPreference)],
    ['Name', request.name],
    ['Email', request.email || 'not provided'],
    ['Phone', request.phone || 'not provided'],
    ['Visualizer finish', finish ? `${finish.name} (${finish.id}) · inspiration, physical sample to confirm` : 'none'],
    ['Notes', request.notes || 'none'],
    ['Photos', request.photos?.length ? `${request.photos.length} attached` : 'none'],
  ] as const;
  const text = details.map(([label, value]) => `${label}: ${value}`).join('\n');
  const rows = details.map(([label, value]) => `<tr><th style="padding:8px 16px 8px 0;text-align:left;vertical-align:top">${escapeHtml(label)}</th><td style="padding:8px 0">${escapeHtml(value)}</td></tr>`).join('');
  const attachments = (request.photos ?? []).map((photo, index) => ({
    filename: `floor-${index + 1}.jpg`,
    content: Buffer.from(photo.data.replace(/^data:image\/jpeg;base64,/, ''), 'base64'),
    contentType: 'image/jpeg' as const,
  }));

  return {
    subject: `New Final Finish quote request · ${reference}`,
    text,
    html: `<div style="font:15px/1.5 Arial,sans-serif;color:#17222a"><h1 style="font:32px Georgia,serif">New floor project</h1><table>${rows}</table></div>`,
    replyTo: request.email || undefined,
    attachments,
  };
}
