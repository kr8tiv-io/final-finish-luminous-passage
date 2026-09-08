export const serviceAreas = [
  { slug: 'edmonton', name: 'Edmonton', region: 'Alberta' },
  { slug: 'sherwood-park', name: 'Sherwood Park', region: 'Strathcona County' },
  { slug: 'st-albert', name: 'St. Albert', region: 'Alberta' },
  { slug: 'leduc', name: 'Leduc', region: 'Alberta' },
  { slug: 'fort-saskatchewan', name: 'Fort Saskatchewan', region: 'Alberta' },
  { slug: 'spruce-grove', name: 'Spruce Grove', region: 'Alberta' },
  { slug: 'beaumont', name: 'Beaumont', region: 'Alberta' },
] as const;

export type ServiceArea = (typeof serviceAreas)[number];
