import type { PublicationApproval } from '../lib/projects/gallery';

export type ImageVariant = {
  avif: string;
  webp: string;
  jpeg: string;
  thumbnail: string;
  width: number;
  height: number;
  alt: string;
  sourceUrl: string;
  crop: {
    objectPosition: string;
    scale?: number;
    translateX?: number;
    translateY?: number;
    rotate?: number;
  };
};

export type Transformation = {
  id: string;
  tabLabel: string;
  title: string;
  homeownerCaption: string;
  frame: 'landscape' | 'portrait';
  before: ImageVariant;
  after: ImageVariant;
  visualMatchRationale: string;
  visualMatchConfidence: 'strong' | 'conditional';
  publicationApproval: PublicationApproval;
};

const image = (
  id: string,
  width: number,
  height: number,
  alt: string,
  sourceUrl: string,
  objectPosition = '50% 52%',
): ImageVariant => ({
  avif: `/images/projects/generated/avif/${id}.avif`,
  webp: `/images/projects/generated/webp/${id}.webp`,
  jpeg: `/images/projects/generated/jpeg/${id}.jpg`,
  thumbnail: `/images/projects/generated/thumbnails/${id}.webp`,
  width,
  height,
  alt,
  sourceUrl,
  crop: { objectPosition },
});

const projectArchive = 'https://www.finalfinishepoxy.ca/projects';

/**
 * Shortlisted from the 96-photo public archive after visual review. Pairing
 * approval remains separate from their public source provenance.
 */
export const transformations: readonly Transformation[] = [
  {
    id: 'interior-support-post',
    tabLabel: '01 / interior',
    title: 'Interior floor with a centre post.',
    homeownerCaption: 'The centre support, three door openings, and built-in shelving remain visible in both photographs.',
    frame: 'landscape',
    before: image('img_3300', 2000, 1500, 'Interior concrete floor with a centre support post, doorways, and open shelving.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/dc36ea2e-f519-4185-8958-1158cea8d8bc/IMG_3300.jpeg', '50% 52%'),
    after: image('img_3313', 2000, 1500, 'Interior floor with a speckled coating, centre support post, doorways, and open shelving.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/fc3920ab-b3ec-42c5-b51b-a221d640c9f0/IMG_3313.jpeg', '50% 52%'),
    visualMatchRationale: 'The support post, three door openings, shelving, and room perimeter closely align.',
    visualMatchConfidence: 'strong',
    publicationApproval: 'pending',
  },
  {
    id: 'garage-tiled-wall',
    tabLabel: '02 / garage',
    title: 'Garage view with tiled wall.',
    homeownerCaption: 'The tiled wall, steps, overhead door hardware, and side doors remain visible in both photographs.',
    frame: 'landscape',
    before: image('img_3107', 2000, 1500, 'Garage concrete floor with tiled wall, steps, overhead door hardware, and side door.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/ada68cbe-2fe3-42de-9c04-ca6199ed1c80/IMG_3107.jpeg', '50% 53%'),
    after: image('img_3116', 2000, 1500, 'Garage floor with a speckled coating, tiled wall, steps, overhead door hardware, and side door.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/5bfe636e-8ec5-46e9-8c9a-cc0552006d0d/IMG_3116.jpeg', '50% 54%'),
    visualMatchRationale: 'The tiled wall, steps, overhead door mechanism, and both side doors closely align.',
    visualMatchConfidence: 'strong',
    publicationApproval: 'pending',
  },
  {
    id: 'garage-centre-door',
    tabLabel: '03 / doorway',
    title: 'Garage view toward the centre door.',
    homeownerCaption: 'The centre door, overhead-door track, wall seams, and coiled hoses remain visible in both photographs.',
    frame: 'landscape',
    before: image('photo+2025-07-14,+12+24+07+pm', 2000, 1500, 'Garage concrete floor viewed toward a centre door, with coiled hoses and overhead-door hardware.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/af162e90-e113-4b9d-b0bd-bead81434336/Photo+2025-07-14%2C+12+24+07+PM.jpg', '50% 54%'),
    after: image('photo+2025-07-15,+10+46+33+am', 2000, 1500, 'Garage floor with a speckled coating viewed toward a centre door, with coiled hoses and overhead-door hardware.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/875ef451-7a9e-406c-9c1f-08fa136e23be/Photo+2025-07-15%2C+10+46+33+AM.jpg', '50% 54%'),
    visualMatchRationale: 'The centre door, overhead-door track, wall seams, hose placement, and perspective closely align.',
    visualMatchConfidence: 'strong',
    publicationApproval: 'pending',
  },
];

/** Candidates retained for local/staging review only; none are publishable yet. */
export const sourceCandidates: readonly Transformation[] = [
  ...transformations,
  {
    id: 'front-steps-candidate',
    tabLabel: 'candidate / June',
    title: 'Front entrance steps candidate.',
    homeownerCaption: 'The red entrance door, brickwork, bay window, and concrete steps identify the same entrance. The crop and publication approval remain under review.',
    frame: 'landscape',
    before: image('photo+2025-06-16,+12+38+02+pm', 2000, 1500, 'Front entrance with unfinished concrete steps, a red door, brickwork, and a bay window.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/bd3c066a-e1e1-4380-8547-53e4e8609c68/Photo+2025-06-16%2C+12+38+02+PM.jpg'),
    after: image('photo+2025-06-17,+12+29+33+pm', 2000, 1500, 'Front entrance steps with a speckled finish beneath the same red door, brickwork, and bay window.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/b1b7ac39-74af-4444-9470-12d306b45bed/Photo+2025-06-17%2C+12+29+33+PM.jpg'),
    visualMatchRationale: 'The entrance landmarks match, but the camera height and scale differ. Review conservative crops before approving a comparison.',
    visualMatchConfidence: 'conditional',
    publicationApproval: 'pending',
  },
  {
    id: 'portrait-garage-candidate',
    tabLabel: 'candidate / portrait',
    title: 'Portrait garage candidate.',
    homeownerCaption: 'This portrait pair is retained for review; its project relationship has not been approved for publication.',
    frame: 'portrait',
    before: image('img_3590', 1500, 2000, 'Portrait garage slab with overhead-door hardware, a drain, and utility connections.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/3cc1ac6b-c4b5-44c7-a69f-55b068ad53ec/IMG_3590.jpeg', '50% 52%'),
    after: image('img_3597', 1500, 2000, 'Portrait garage floor with a speckled coating, overhead-door hardware, a drain, and utility connections.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/c3badfb9-eb10-4772-b3c5-262d554e099e/IMG_3597.jpeg', '50% 52%'),
    visualMatchRationale: 'The drain, utility wall, and overhead-door details are close, but the portrait crop needs approval.',
    visualMatchConfidence: 'conditional',
    publicationApproval: 'pending',
  },
];

export const projectArchiveUrl = projectArchive;

export type SelectedProjectPhoto = {
  id: string;
  image: ImageVariant;
  /**
   * Factual caption. Only what is visible in the frame, plus a date when the
   * source filename carries one. Never a coating system, a location, a client,
   * or a duration — none of those are recorded for these files.
   */
  caption: string;
};

/**
 * Production fallback for the proof section: six finished-floor photographs
 * from the public archive, shown singly. These are the "after" frames of the
 * three wired comparisons plus three more afters from
 * `project-photo-pairs.json` `curatedPairCandidates`. A single photograph
 * carries no pairing claim, so it needs no pairing approval — which is why
 * this grid can stand in while every pair is still pending.
 */
export const selectedProjectPhotos: readonly SelectedProjectPhoto[] = [
  {
    id: 'img_3313',
    image: image('img_3313', 2000, 1500, 'Interior floor with a speckled coating, centre support post, doorways, and open shelving.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/fc3920ab-b3ec-42c5-b51b-a221d640c9f0/IMG_3313.jpeg'),
    caption: 'Finished interior floor with a centre support post.',
  },
  {
    id: 'img_3116',
    image: image('img_3116', 2000, 1500, 'Garage floor with a speckled coating, tiled wall, steps, overhead door hardware, and side door.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/5bfe636e-8ec5-46e9-8c9a-cc0552006d0d/IMG_3116.jpeg', '50% 54%'),
    caption: 'Finished garage floor beside a tiled wall.',
  },
  {
    id: 'photo+2025-07-15,+10+46+33+am',
    image: image('photo+2025-07-15,+10+46+33+am', 2000, 1500, 'Garage floor with a speckled coating viewed toward a centre door, with coiled hoses and overhead-door hardware.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/875ef451-7a9e-406c-9c1f-08fa136e23be/Photo+2025-07-15%2C+10+46+33+AM.jpg', '50% 54%'),
    caption: 'Finished garage floor at the centre door, July 2025.',
  },
  {
    id: 'photo+2025-06-22,+12+03+10+pm',
    image: image('photo+2025-06-22,+12+03+10+pm', 2000, 1500, 'Garage floor and step treads with a blue-grey speckled coating, wood stair railing, and coved base.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/f48ced51-7ccc-442c-b0b5-47569b4840cf/Photo+2025-06-22%2C+12+03+10+PM.jpg', '50% 56%'),
    caption: 'Finished garage floor and step treads, June 2025.',
  },
  {
    id: 'img_3188',
    image: image('img_3188', 2000, 1500, 'Garage floor with a grey speckled coating, coved base, side door, and window.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/38c1eb62-104b-428d-805a-46359fe5918f/IMG_3188.jpeg', '50% 56%'),
    caption: 'Finished garage floor with a coved base.',
  },
  {
    id: 'img_2817',
    image: image('img_2817', 2000, 1500, 'Garage floor with a speckled coating seen from the open overhead door, with interior steps and a cabinet beyond.', 'https://images.squarespace-cdn.com/content/v1/680050ff7ef310426f70c44f/4c4bf4e1-ae48-401c-837b-e0b1da737d9c/IMG_2817.jpeg', '50% 56%'),
    caption: 'Finished garage floor seen from the overhead door.',
  },
];
