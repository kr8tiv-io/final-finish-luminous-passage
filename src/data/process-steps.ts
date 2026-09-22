/**
 * The six steps of a Final Finish floor, in order. The one source for `/process` and the
 * homepage's process track.
 *
 * Every step comes from the one place process facts exist: the live blog post "Our Epoxy
 * Flooring Process" (CONTEXT-SHEET A8) — a free estimate from photos or a visit, a
 * two-day installation that varies, grinding, cosmetic crack filling, a flake broadcast,
 * a scrape, a top coat, and an optional anti-slip top coat. Nothing else is here (Step 29
 * removed a primer coat, a cove detail, a "drive-on window" and a timing promise that
 * none of those sources supports).
 *
 * `texture` names the illustrative material close-up the homepage track shows for the
 * step (scripts/build-textures.mjs) — a drawing of the surface, not a project photograph.
 */
export interface ProcessStep {
  readonly title: string;
  readonly copy: string;
  readonly texture: string;
  readonly textureAlt: string;
}

export const PROCESS_STEPS: readonly ProcessStep[] = [
  {
    title: 'A free estimate',
    copy: 'Send photos of the floor, or book a visit. Either works, and both are free. Denis wants to see the concrete, what is on it now, and any cracks you already know about.',
    texture: 'prep-slab',
    textureAlt: 'Illustration of bare grey concrete, pitted and uneven',
  },
  {
    title: 'Grinding',
    copy: 'The slab is ground to open the surface so the coating can bond. It is loud, dusty work, and the room has to be empty before it starts.',
    texture: 'prep-ground',
    textureAlt: 'Illustration of concrete with the overlapping arcs a grinder leaves',
  },
  {
    title: 'Cosmetic crack filling',
    copy: 'Visible cracks are filled so they do not read through the finish. If something turns up that is structural rather than cosmetic, you hear about it then, not later.',
    texture: 'prep-crack',
    textureAlt: 'Illustration of a crack in concrete filled flush with a pale filler',
  },
  {
    title: 'The flake broadcast',
    copy: 'Flake is broadcast into the coat while it is still open. This is where the colour and the pattern of the floor are set.',
    texture: 'prep-flake',
    textureAlt: 'Illustration of grey, white and charcoal flake chips scattered over a base coat',
  },
  {
    title: 'The scrape',
    copy: 'Once it has set, the surface is scraped back. That is what turns a loose broadcast into a flat floor you can walk on and clean.',
    texture: 'prep-scraped',
    textureAlt: 'Illustration of a full flake broadcast scraped flat',
  },
  {
    title: 'The top coat',
    copy: 'The last coat goes over everything. Where a room needs more grip, an anti-slip top coat goes on instead, and that is a decision we make with you.',
    texture: 'prep-glossy',
    textureAlt: 'Illustration of a finished flake floor under a glossy clear coat',
  },
];
