import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const films = ['pour', 'walkway', 'garage', 'basement', 'finish', 'consultation', 'mancave'];
const profiles = [{ height: 480, crf: 27 }, { height: 720, crf: 26 }, { height: 1080, crf: 27 }];
/**
 * Per-film ladder overrides. A film absent from this map builds every profile
 * height, which is what each film did before `mancave` existed.
 *
 * `mancave` is Act 4's third room. `fold-and-shoot-left` keeps two rooms
 * resident at once and the storyboard budgets Act 4 at roughly 2.4 MB of 480p
 * film; the room is never a full-bleed hero, so its ladder stops at 720 and the
 * 1080 rung is deliberately not built.
 */
const filmHeights = { mancave: [480, 720] };
const heightsFor = (film) => (Object.hasOwn(filmHeights, film) ? filmHeights[film] : profiles.map((profile) => profile.height));
/**
 * `--only a,b` restricts the run to the named films and switches the manifest
 * write from rebuild to merge, so a targeted re-encode cannot drop, reorder, or
 * rewrite the entries of films it never touched. With no flag the run is the
 * full rebuild it has always been.
 */
const onlyIndex = process.argv.indexOf('--only');
const selected = onlyIndex >= 0 ? (process.argv[onlyIndex + 1] ?? '').split(',').map((name) => name.trim()).filter(Boolean) : null;
if (selected) {
  if (!selected.length) throw new Error('--only requires a comma-separated film list');
  const unknown = selected.filter((film) => !films.includes(film));
  if (unknown.length) throw new Error(`Unknown film(s) for --only: ${unknown.join(', ')}`);
}
const queue = selected ? films.filter((film) => selected.includes(film)) : films;
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const manifest = { version: 1, fps: 24, gop: 6, audio: false, sourcePreserved: true, assets: [] };
for (const { height, crf } of profiles) {
  const directory = resolve(root, 'public/videos/follow-floor', String(height));
  mkdirSync(directory, { recursive: true });
  for (const film of queue) {
    if (!heightsFor(film).includes(height)) continue;
    const source = resolve(root, 'assets/films/source', `epoxy-${film}.mp4`);
    const target = resolve(directory, `epoxy-${film}.mp4`);
    if (!existsSync(target)) {
      const encoded = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-n', '-i', source, '-an', '-vf', `scale=-2:${height},fps=24`, '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-g', '6', '-keyint_min', '6', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-threads', '2', target], { windowsHide: true, encoding: 'utf8', timeout: 180_000 });
      if (encoded.status !== 0) throw new Error(`Encode failed: ${film}/${height}: ${encoded.stderr}`);
    }
    const probe = spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', target], { windowsHide: true, encoding: 'utf8', timeout: 10_000 });
    if (probe.status !== 0) throw new Error(`Invalid film: ${target}`);
    const metadata = JSON.parse(probe.stdout);
    if (metadata.streams[0]?.height !== height || metadata.streams[0]?.r_frame_rate !== '24/1') throw new Error(`Profile mismatch: ${film}/${height}`);
    const asset = { film, height, crf, src: `/videos/follow-floor/${height}/epoxy-${film}.mp4`, bytes: statSync(target).size, sha256: digest(target), sourceSha256: digest(source), ...metadata.streams[0], duration: Number(metadata.format.duration) };
    manifest.assets.push(asset);
    process.stdout.write(`${height}p ${film}: ${Math.round(asset.bytes / 1024)} KiB\n`);
  }
}
const manifestPath = resolve(root, 'public/videos/follow-floor/manifest.json');
if (selected && existsSync(manifestPath)) {
  const previous = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // The header keys are this run's contract; a merge must never silently adopt
  // a manifest written under a different fps, GOP, or audio policy.
  for (const key of ['version', 'fps', 'gop', 'audio', 'sourcePreserved']) {
    if (key in previous && previous[key] !== manifest[key]) throw new Error(`Manifest ${key} drift: ${previous[key]} != ${manifest[key]}`);
  }
  // Append-only merge. Untouched films keep their entry and their position
  // byte for byte; a re-encoded film/height replaces itself in place; a new
  // film/height pair is appended in ladder order.
  const merged = Array.isArray(previous.assets) ? [...previous.assets] : [];
  for (const asset of manifest.assets) {
    const at = merged.findIndex((entry) => entry.film === asset.film && entry.height === asset.height);
    if (at >= 0) merged[at] = asset; else merged.push(asset);
  }
  manifest.assets = merged;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
for (const { height } of profiles) {
  const bytes = manifest.assets.filter((asset) => asset.height === height).reduce((total, asset) => total + asset.bytes, 0);
  process.stdout.write(`TOTAL ${height}p: ${(bytes / 1024 / 1024).toFixed(2)} MiB\n`);
}
