import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const source = resolve(root, 'public/videos/epoxy-pour.mp4');
const profiles = [
  { height: 480, crf: 27 },
  { height: 720, crf: 26 },
  { height: 1080, crf: 27 },
];
// Neutralize warm metallic casts while keeping pearl highlights and translucent
// blue/cool shadows. This filter is applied only to the film video stream.
const filter = 'colorchannelmixer=rr=0.70:rg=0.16:rb=0.06:gr=0.08:gg=1.05:gb=0.15:br=0.12:bg=0.36:bb=0.88,eq=saturation=0.52:contrast=1.02:brightness=0.055';
const replace = process.argv.includes('--replace');
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function run(command, args, timeout = 180_000) {
  const result = spawnSync(command, args, { windowsHide: true, encoding: 'utf8', timeout });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.error?.message}`);
  return result;
}

function probe(file, countFrames = false) {
  const args = ['-v', 'error'];
  if (countFrames) args.push('-count_frames');
  args.push('-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name,r_frame_rate,nb_read_frames,nb_frames,pix_fmt', '-show_entries', 'format=duration', '-of', 'json', file);
  return JSON.parse(run(ffprobe, args, 30_000).stdout);
}

if (!existsSync(source)) throw new Error(`Missing source: ${source}`);
const sourceMetadata = probe(source, true);
const sourceStream = sourceMetadata.streams?.[0];
if (sourceStream?.r_frame_rate !== '24/1' || Number(sourceStream.nb_read_frames || sourceStream.nb_frames) !== 241) {
  throw new Error(`Source timing changed: expected 241 frames at 24 fps, got ${sourceStream?.nb_read_frames || sourceStream?.nb_frames} at ${sourceStream?.r_frame_rate}`);
}

const assets = [];
for (const { height, crf } of profiles) {
  const directory = resolve(root, 'public/videos/follow-floor', String(height));
  const posterDirectory = resolve(root, 'public/images/brand/follow-floor', String(height));
  mkdirSync(directory, { recursive: true });
  mkdirSync(posterDirectory, { recursive: true });
  const target = resolve(directory, 'epoxy-pour-pearl.mp4');
  const poster = resolve(posterDirectory, 'epoxy-pour-pearl-poster.jpg');
  if (replace) {
    // The explicit replacement mode is intentionally limited to these three
    // generated derivative pairs; the source path is never a target here.
    for (const generated of [target, poster]) if (existsSync(generated)) unlinkSync(generated);
  }
  if (!existsSync(target)) {
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-n', '-i', source, '-an', '-vf', `scale=-2:${height}:flags=lanczos,fps=24,${filter}`, '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-g', '6', '-keyint_min', '6', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-threads', '2', target]);
  }
  if (!existsSync(poster)) run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-n', '-i', target, '-frames:v', '1', '-q:v', '2', poster]);
  const metadata = probe(target, true);
  const stream = metadata.streams?.[0];
  if (stream?.height !== height || stream?.r_frame_rate !== '24/1' || Number(stream.nb_read_frames || stream.nb_frames) !== 241) throw new Error(`Profile mismatch: ${target}`);
  assets.push({ height, crf, video: `/videos/follow-floor/${height}/epoxy-pour-pearl.mp4`, poster: `/images/brand/follow-floor/${height}/epoxy-pour-pearl-poster.jpg`, bytes: statSync(target).size, posterBytes: statSync(poster).size, sha256: digest(target), posterSha256: digest(poster), sourceSha256: digest(source), ...stream, duration: Number(metadata.format.duration) });
}
console.log(JSON.stringify({ source: { file: '/videos/epoxy-pour.mp4', ...sourceStream, frames: Number(sourceStream.nb_read_frames || sourceStream.nb_frames), duration: Number(sourceMetadata.format.duration) }, filter, assets }, null, 2));
