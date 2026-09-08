export type FinishFamily = 'flake' | 'solid' | 'metallic';
export type FinishPattern =
  | 'broadcast'
  | 'large-flake'
  | 'quartz'
  | 'solid'
  | 'marble'
  | 'ocean'
  | 'lava'
  | 'galaxy'
  | 'pearl'
  | 'copper';

export interface FinishPreset {
  id: string;
  name: string;
  family: FinishFamily;
  pattern: FinishPattern;
  description: string;
  colors: readonly [string, string, string];
  scale: number;
  roughness: number;
  inspirationOnly: true;
}

const makeFinish = (
  id: string,
  name: string,
  family: FinishFamily,
  pattern: FinishPattern,
  description: string,
  colors: readonly [string, string, string],
  scale = 1,
  roughness = 0.52,
): FinishPreset => ({ id, name, family, pattern, description, colors, scale, roughness, inspirationOnly: true });

export const PATTERN_CODE: Record<FinishPattern, number> = {
  broadcast: 0,
  'large-flake': 1,
  quartz: 2,
  solid: 3,
  marble: 4,
  ocean: 5,
  lava: 6,
  galaxy: 7,
  pearl: 8,
  copper: 9,
};

export function finishCssBackground(finish: FinishPreset): string {
  const [a, b, c] = finish.colors;
  switch (finish.pattern) {
    case 'marble':
      return `radial-gradient(ellipse at 18% 22%, ${c}cc 0 6%, transparent 28%), radial-gradient(ellipse at 78% 70%, ${b}99 0 10%, transparent 36%), repeating-linear-gradient(118deg, ${a} 0 2%, ${b} 3% 5%, ${a} 7% 11%, ${c}66 12% 13%, ${a} 16% 22%), linear-gradient(160deg, ${a}, ${b})`;
    case 'ocean':
      return `radial-gradient(ellipse at 30% 20%, ${c}aa 0 12%, transparent 40%), repeating-linear-gradient(102deg, ${a} 0 8%, ${b} 14% 18%, ${c} 22% 24%, ${a} 32% 40%), linear-gradient(160deg, ${b}, ${a} 60%, ${c})`;
    case 'lava':
      return `radial-gradient(ellipse at 40% 35%, ${c} 0 4%, transparent 22%), radial-gradient(ellipse at 70% 80%, ${c}99 0 7%, transparent 28%), linear-gradient(125deg, ${a} 0 30%, ${b} 48%, ${c} 62%, ${a} 100%)`;
    case 'galaxy':
      return `radial-gradient(circle at 22% 30%, ${c} 0 1.2%, transparent 2%), radial-gradient(circle at 70% 18%, #fff 0 0.7%, transparent 1.4%), radial-gradient(ellipse at 60% 60%, ${b}99 0 18%, transparent 48%), linear-gradient(150deg, ${a}, ${b} 55%, ${a})`;
    case 'pearl':
      return `conic-gradient(from 210deg at 40% 40%, ${a}, ${c}, ${b}, ${a} 70%, ${c}), radial-gradient(ellipse at 70% 20%, ${c}aa 0 16%, transparent 42%)`;
    case 'copper':
      return `radial-gradient(ellipse at 25% 30%, ${c} 0 8%, transparent 30%), repeating-linear-gradient(128deg, ${a} 0 6%, ${c} 8% 9%, ${a} 14% 20%, ${b} 24% 26%), linear-gradient(160deg, ${a}, ${b})`;
    case 'large-flake':
      return `radial-gradient(circle at 14% 22%, ${c} 0 3.2%, transparent 3.4%), radial-gradient(circle at 38% 68%, ${b} 0 4.4%, transparent 4.7%), radial-gradient(circle at 72% 18%, ${c} 0 2.6%, transparent 2.8%), radial-gradient(circle at 84% 58%, ${b} 0 5%, transparent 5.3%), radial-gradient(circle at 52% 40%, ${c} 0 2%, transparent 2.2%), linear-gradient(135deg, ${a}, ${b} 80%)`;
    case 'quartz':
      return `repeating-conic-gradient(from 20deg at 50% 50%, ${a} 0 4deg, ${b} 4deg 5deg, ${a} 5deg 9deg, ${c} 9deg 10deg), linear-gradient(135deg, ${a}, ${b})`;
    case 'solid':
      return `radial-gradient(ellipse at 18% 12%, rgba(255,255,255,.28), transparent 42%), linear-gradient(145deg, ${b}, ${a} 48%, ${c})`;
    default:
      return `radial-gradient(circle at 16% 28%, ${c} 0 2%, transparent 2.6%), radial-gradient(circle at 62% 72%, ${b} 0 3%, transparent 3.6%), radial-gradient(circle at 82% 20%, ${c} 0 1.8%, transparent 2.4%), radial-gradient(circle at 38% 54%, ${b} 0 2.4%, transparent 3%), ${a}`;
  }
}

export const finishPresets: readonly FinishPreset[] = [
  makeFinish('alabaster-stone', 'Full-Flake Porcelain', 'flake', 'large-flake', 'A high-coverage porcelain, stone and charcoal broadcast with large-format chips that read like terrazzo.', ['#f4f0e6', '#cfc8ba', '#3a4044'], 1.15, 0.48),
  makeFinish('arctic-mist', 'Arctic Quartz', 'flake', 'quartz', 'A cool quartz-blend flake with white, mist and graphite for a crisp, salt-ready garage.', ['#e8eef0', '#9aa6aa', '#2c3438'], 0.62, 0.5),
  makeFinish('river-rock', 'River Terrazzo', 'flake', 'large-flake', 'Large taupe, slate and cream chips inspired by Alberta river stone, broadcast full-hide.', ['#d7cbb6', '#7d7a72', '#f3ece0'], 1.2, 0.5),
  makeFinish('salt-pepper', 'Salt & Pepper', 'flake', 'broadcast', 'A graphic black, white and silver-grey blend with mica sparkle for commercial traffic.', ['#f7f6f1', '#6e7375', '#161b1e'], 0.7, 0.48),
  makeFinish('blue-hour', 'Cobalt Terrazzo', 'flake', 'large-flake', 'Bold cobalt chips in a mist-grey field — a contemporary full-flake with architectural colour.', ['#e6eceb', '#5e86a0', '#0f3d6a'], 1.1, 0.47),
  makeFinish('driftwood', 'Warm Oak Blend', 'flake', 'broadcast', 'Sand, weathered oak and graphite flakes that sit quietly under warm millwork.', ['#e2d2b8', '#8d7c67', '#3d4143'], 0.88, 0.52),
  makeFinish('granite-light', 'Pale Granite', 'flake', 'quartz', 'Fine pale-granite quartz with pin sparkle for an understated, high-light garage.', ['#e4e3dc', '#b0aea7', '#4e5456'], 0.58, 0.5),
  makeFinish('granite-deep', 'Charcoal Quartz', 'flake', 'quartz', 'Deep mineral greys with mica flash — a modern dark flake that still reads as depth, not paint.', ['#8d8f8b', '#454c4e', '#1b2023'], 0.64, 0.46),
  makeFinish('prairie-sand', 'Prairie Large-Flake', 'flake', 'large-flake', 'Cream, wheat and stone chips at a larger scale for a brighter, more contemporary garage field.', ['#f0e4cc', '#c4a478', '#6a6358'], 1.25, 0.5),
  makeFinish('frost-line', 'Frost Full Broadcast', 'flake', 'broadcast', 'White-dominant full flake with silver-grey mica for maximum reflected winter light.', ['#f7f6ef', '#c5ccc9', '#6f7a7e'], 0.74, 0.47),
  makeFinish('ironwood', 'Ironwood Workshop', 'flake', 'large-flake', 'Graphite, brown-grey and warm stone chips for a grounded shop floor that hides traffic.', ['#3e3e3a', '#7a6e60', '#c2b7a6'], 1.18, 0.5),
  makeFinish('gallery-grey', 'Gallery Blend', 'flake', 'broadcast', 'A tonal grey flake designed to sit under collections without competing with the cars.', ['#d5d5cf', '#8c9190', '#4c5356'], 0.82, 0.5),
  makeFinish('cobalt-trace', 'Cobalt Trace', 'flake', 'quartz', 'Neutral quartz punctuated by a restrained cobalt accent chip.', ['#e7e4db', '#6f7779', '#164f83'], 0.6, 0.48),
  makeFinish('midnight-aggregate', 'Midnight Aggregate', 'flake', 'large-flake', 'Blue-black, pewter and pale chips — a dramatic full-flake with gallery depth.', ['#121c24', '#5c686e', '#e2e3de'], 1.12, 0.46),

  makeFinish('porcelain', 'Porcelain Gloss', 'solid', 'solid', 'A luminous warm-white solid with a glass-clear topcoat, inspired by sunlit plaster.', ['#f3efe6', '#fffaf2', '#d4cec2'], 1, 0.28),
  makeFinish('limestone', 'Limestone Satin', 'solid', 'solid', 'A calm warm-grey solid that pairs with oak, stone and white walls.', ['#cfc8bb', '#ddd6cb', '#b3aca0'], 1, 0.38),
  makeFinish('architect-grey', 'Architect Grey', 'solid', 'solid', 'A balanced medium grey with a precise contemporary sheen for studios and showrooms.', ['#8a9090', '#a4a8a5', '#6e7476'], 1, 0.32),
  makeFinish('graphite', 'Graphite Showroom', 'solid', 'solid', 'A deep graphite solid for high-contrast garages and commercial rooms.', ['#2a3235', '#3d4648', '#171e21'], 1, 0.26),
  makeFinish('cobalt', 'Cobalt Solid', 'solid', 'solid', 'A saturated architectural blue inspired by the Final Finish accent, in a wet-look topcoat.', ['#164f83', '#2a6aa0', '#0c3358'], 1, 0.24),
  makeFinish('sage-stone', 'Sage Mineral', 'solid', 'solid', 'A desaturated green-grey solid with a soft mineral, almost-plaster character.', ['#87938b', '#a3aea4', '#6c7973'], 1, 0.36),
  makeFinish('clay', 'Fired Clay', 'solid', 'solid', 'A restrained warm clay solid that feels considered rather than rustic.', ['#a37c69', '#c0937c', '#7a584c'], 1, 0.34),
  makeFinish('deep-navy', 'Ink Navy', 'solid', 'solid', 'A near-black navy solid with more colour than charcoal, for evening showrooms.', ['#142833', '#1f3a4b', '#0c1820'], 1, 0.25),

  makeFinish('pearl-current', 'Pearl Calacatta', 'metallic', 'pearl', 'Pearlescent white with silver veins — liquid marble with depth no slab can fake.', ['#f6f3ec', '#c5cdcf', '#ffffff'], 1.55, 0.16),
  makeFinish('silver-tide', 'Graphite Silver', 'metallic', 'marble', 'Charcoal base with silver metalite movement — the industrial-modern garage look.', ['#1c2226', '#8d989c', '#e8eae6'], 1.5, 0.18),
  makeFinish('blue-orbit', 'Blue Orbit', 'metallic', 'ocean', 'Cobalt and midnight-blue movement with fine pale highlights.', ['#0c2740', '#1a6a9c', '#d7eef7'], 1.65, 0.14),
  makeFinish('bronze-veil', 'Copper on Black', 'metallic', 'copper', 'Deep black with hand-swirled copper veining — high contrast, gallery-dramatic.', ['#0e0d0c', '#8a4a1c', '#e0b07a'], 1.48, 0.17),
  makeFinish('smoked-quartz', 'Nero Marquina', 'metallic', 'marble', 'Black marble epoxy with gold and pewter veins, sealed under a glass polyaspartic.', ['#0c0d0e', '#c9a45a', '#6e6a64'], 1.52, 0.16),
  makeFinish('glacial-water', 'Ocean Teal', 'metallic', 'ocean', 'Deep teal, pearl and white currents — water-like flow for spas, pools and bright rooms.', ['#0b3a44', '#2f9aa8', '#e7f6f4'], 1.6, 0.15),
  makeFinish('umbra', 'Midnight Galaxy', 'metallic', 'galaxy', 'Near-black nebula with pewter and star-flash — a cosmic statement floor.', ['#07080c', '#3d4a72', '#d8dde8'], 1.58, 0.13),
  makeFinish('champagne-stone', 'Champagne Bronze', 'metallic', 'pearl', 'Warm champagne, bronze and pearl movement with a soft iridescent shift.', ['#c9ae7a', '#f4ead6', '#6e4f2c'], 1.5, 0.18),
];
