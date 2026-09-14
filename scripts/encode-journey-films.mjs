import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const films = ['pour', 'walkway', 'garage', 'basement', 'finish', 'consultation'];
const profiles = [{ height: 480, crf: 27 }, { height: 720, crf: 26 }, { height: 1080, crf: 27 }];
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const manifest = { version: 1, fps: 24, gop: 6, audio: false, sourcePreserved: true, assets: [] };
for (const { height, crf } of profiles) {
  const directory = resolve(root, 'public/videos/follow-floor', String(height));
  mkdirSync(directory, { recursive: true });
  for (const film of films) {
    const source = resolve(root, 'public/videos', `epoxy-${film}.mp4`);
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
writeFileSync(resolve(root, 'public/videos/follow-floor/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const { height } of profiles) {
  const bytes = manifest.assets.filter((asset) => asset.height === height).reduce((total, asset) => total + asset.bytes, 0);
  process.stdout.write(`TOTAL ${height}p: ${(bytes / 1024 / 1024).toFixed(2)} MiB\n`);
}
