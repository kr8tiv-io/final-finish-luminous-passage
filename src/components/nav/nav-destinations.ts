/**
 * Single source of truth for the primary navigation: the six header links, the
 * chapter station each one belongs to (the harvested G1 chapter-station rail,
 * HARVEST.md row "Chapter-station rail concept + DrawSVG spine"), and the floor
 * finish the live floor blends toward while that link is hovered or focused.
 *
 * `SiteHeader.astro` renders from this list, `nav-menu-controller.ts` reads the
 * finish off each link's `data-nav-finish`, and `FloorMenuScene.tsx` maps that
 * key onto a shader weight. Nothing here is a factual claim about the business;
 * the station words come from the homepage chapter sequence in
 * `src/pages/index.astro` and the finishes are material directions only.
 */

export type FloorFinishKey = 'pearl' | 'warm-grey-flake' | 'cobalt-metallic' | 'salt-pepper-flake' | 'paper';

export interface NavDestination {
  readonly href: string;
  readonly label: string;
  /** Chapter station this destination belongs to, shown as a small rail label. */
  readonly station: string;
  readonly finish: FloorFinishKey;
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { href: '/services', label: 'Services', station: 'Surface', finish: 'pearl' },
  { href: '/services/commercial-epoxy-flooring', label: 'Commercial', station: 'Your space', finish: 'warm-grey-flake' },
  { href: '/projects', label: 'Projects', station: 'Projects', finish: 'salt-pepper-flake' },
  { href: '/finishes', label: 'Finishes', station: 'Finishes', finish: 'cobalt-metallic' },
  { href: '/floor-visualizer', label: 'See your floor', station: 'Your space', finish: 'warm-grey-flake' },
  { href: '/resources', label: 'Resources', station: 'Denis', finish: 'paper' },
];

/** `01`…`06` — the numbering shown beside each line in the full-screen menu. */
export function navIndexLabel(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export const FLOOR_FINISH_KEYS: readonly FloorFinishKey[] = [
  'pearl',
  'warm-grey-flake',
  'cobalt-metallic',
  'salt-pepper-flake',
  'paper',
];

export function isFloorFinishKey(value: unknown): value is FloorFinishKey {
  return typeof value === 'string' && (FLOOR_FINISH_KEYS as readonly string[]).includes(value);
}

/** Menu opened/closed. `settled` is true once the transition has finished. */
export const NAV_MENU_STATE_EVENT = 'ffe:nav-menu-state';
/** Hovered/focused destination changed while the menu is open. */
export const NAV_MENU_FINISH_EVENT = 'ffe:nav-menu-finish';

export interface NavMenuStateDetail {
  readonly open: boolean;
  readonly settled: boolean;
}

export interface NavMenuFinishDetail {
  readonly finish: FloorFinishKey | null;
}
