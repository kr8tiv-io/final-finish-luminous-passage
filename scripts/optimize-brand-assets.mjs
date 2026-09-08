import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const output = resolve('public/images/brand');
await mkdir(output, { recursive: true });

const scenes = ['luminous-passage-keyframe', 'foundation-chamber', 'luminous-finish-hall', 'consultation-court'];

await Promise.all(scenes.flatMap((name) => {
  const source = resolve(`assets/brand/source/${name}.png`);
  const image = sharp(source).resize({ width: 1920, withoutEnlargement: true });
  return [
    image.clone().avif({ quality: 70, effort: 7 }).toFile(resolve(output, `${name}.avif`)),
    image.clone().webp({ quality: 80, effort: 6 }).toFile(resolve(output, `${name}.webp`)),
    image.clone().jpeg({ quality: 85, mozjpeg: true }).toFile(resolve(output, `${name}.jpg`)),
  ];
}));

await sharp(resolve('assets/brand/source/luminous-passage-keyframe.png'))
    .resize({ width: 1200, height: 630, fit: 'cover', position: 'centre' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(resolve(output, 'final-finish-epoxy-og.jpg'));

console.log(`Optimized ${scenes.length} luminous passage scenes and the social preview.`);
