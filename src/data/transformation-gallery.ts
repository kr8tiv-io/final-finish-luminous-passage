type ImageVariant = {
  avif: string;
  webp: string;
  jpeg: string;
};

export type Transformation = {
  id: string;
  tabLabel: string;
  title: string;
  homeownerCaption: string;
  frame: 'landscape' | 'portrait';
  before: ImageVariant & { width: number; height: number; alt: string };
  after: ImageVariant & { width: number; height: number; alt: string };
  visualMatchRationale: string;
  clientApproval: 'pending';
};

const image = (id: string, width: number, height: number, alt: string) => ({
  avif: `/images/projects/generated/avif/${id}.avif`,
  webp: `/images/projects/generated/webp/${id}.webp`,
  jpeg: `/images/projects/generated/jpeg/${id}.jpg`,
  width,
  height,
  alt,
});

/**
 * Visual-match selections from the public Projects archive. These document
 * observable framing only; they do not assert a client-approved project pairing.
 */
export const transformations: readonly Transformation[] = [
  {
    id: 'interior-floor',
    tabLabel: '01 / interior',
    title: 'Start with the floor you have.',
    homeownerCaption: 'The support post and doorways stay fixed, so the change is easy to inspect at home.',
    frame: 'landscape',
    before: image('img_3300', 2500, 1875, 'Uncoated interior concrete floor with a central support post and doorways.'),
    after: image('img_3313', 2500, 1875, 'Finished flake floor in the same interior view, with a central support post and doorways.'),
    visualMatchRationale: 'The support post, three door openings, shelving, and perimeter layout align closely in both landscape photographs.',
    clientApproval: 'pending',
  },
  {
    id: 'garage-doorway',
    tabLabel: '02 / doorway',
    title: 'See the garage from the doorway.',
    homeownerCaption: 'Compare the threshold and slab joints before deciding how you want the floor to read.',
    frame: 'landscape',
    before: image('photo+2025-07-14,+12+24+07+pm', 2500, 1875, 'Uncoated garage floor viewed through the open overhead door.'),
    after: image('photo+2025-07-15,+10+46+33+am', 2500, 1875, 'Finished flake garage floor viewed through the open overhead door.'),
    visualMatchRationale: 'The overhead-door threshold, central service door, wall layout, and slab joints provide a close landscape framing match.',
    clientApproval: 'pending',
  },
  {
    id: 'garage-bay',
    tabLabel: '03 / garage bay',
    title: 'Keep the working bay in view.',
    homeownerCaption: 'The doors, drain, and utility wall remain visible while you compare the floor.',
    frame: 'portrait',
    before: image('img_3590', 2500, 3333, 'Uncoated garage slab with overhead doors, floor drain, and utility connections.'),
    after: image('img_3597', 2500, 3333, 'Finished flake garage floor with overhead doors, floor drain, and utility connections.'),
    visualMatchRationale: 'The overhead-door hardware, right-side service door, drain, and utility wall indicate the same garage bay from a closely related portrait angle.',
    clientApproval: 'pending',
  },
];
