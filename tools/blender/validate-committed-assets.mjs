/**
 * Browser/CI-safe verification for committed Luminous Passage assets.
 * No Blender binary, add-ons, or network access is needed.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const public3d = process.env.LP_3D_ROOT ? path.resolve(process.env.LP_3D_ROOT) : path.join(root, 'public', '3d');
const textureContract = JSON.parse(await readFile(path.join(root, 'tools', 'blender', 'texture-contract.json'), 'utf8'));
const slugs = [
  'luminous-passage-entry', 'luminous-passage-gallery', 'luminous-passage-court',
  'luminous-passage-finish-alcove', 'luminous-passage-material-library', 'luminous-passage-camera',
];
const fail = (message) => { throw new Error(`3D asset validation: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

function parseGlb(data, filename) {
  assert(data.subarray(0, 4).toString() === 'glTF', `${filename} missing GLB magic`);
  assert(data.readUInt32LE(4) === 2, `${filename} is not glTF 2`);
  assert(data.readUInt32LE(8) === data.length, `${filename} header length mismatch`);
  let offset = 12;
  let json;
  let binLength = 0;
  let bin = Buffer.alloc(0);
  while (offset < data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString();
    assert(offset + 8 + length <= data.length, `${filename} has a truncated chunk`);
    if (type === 'JSON') json = JSON.parse(data.subarray(offset + 8, offset + 8 + length).toString().trim());
    if (type === 'BIN\0') { binLength = length; bin = data.subarray(offset + 8, offset + 8 + length); }
    offset += 8 + length;
  }
  assert(offset === data.length && json, `${filename} has an invalid chunk layout`);
  return { json, binLength, bin };
}

function validateStructure(glb, binLength, bin, filename) {
  const buffers = glb.buffers ?? [];
  assert(buffers.length <= 1 && (!buffers.length || !buffers[0].uri && buffers[0].byteLength <= binLength), `${filename} has invalid/external binary buffers`);
  const componentSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  const views = glb.bufferViews ?? [];
  for (const view of views) assert((view.buffer ?? 0) === 0 && (view.byteOffset ?? 0) + view.byteLength <= binLength, `${filename} has out-of-range bufferView`);
  for (const accessor of glb.accessors ?? []) {
    if (accessor.bufferView === undefined) continue;
    const view = views[accessor.bufferView];
    assert(view, `${filename} accessor references missing bufferView`);
    const size = componentSize[accessor.componentType] * componentCount[accessor.type];
    const used = (accessor.byteOffset ?? 0) + Math.max(accessor.count - 1, 0) * (view.byteStride ?? size) + size;
    assert(used <= view.byteLength, `${filename} accessor exceeds bufferView`);
  }
  const images = glb.images ?? [];
  const textures = glb.textures ?? [];
  for (const image of images) {
    assert(!image.uri && image.mimeType === 'image/png' && Number.isInteger(image.bufferView) && views[image.bufferView], `${filename} has a non-embedded/non-PNG image`);
    const view = views[image.bufferView];
    assert(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${filename} embedded image has an invalid PNG signature`);
  }
  for (const texture of textures) assert(Number.isInteger(texture.source) && texture.source >= 0 && texture.source < images.length, `${filename} texture has invalid source`);
  for (const material of glb.materials ?? []) {
    const pbr = material.pbrMetallicRoughness ?? {};
    for (const slot of [pbr.baseColorTexture, pbr.metallicRoughnessTexture, material.normalTexture, material.occlusionTexture, material.emissiveTexture]) {
      if (slot) assert(Number.isInteger(slot.index) && slot.index >= 0 && slot.index < textures.length, `${filename} material references missing texture`);
    }
  }
}

const manifest = JSON.parse(await readFile(path.join(public3d, 'luminous-passage.manifest.json'), 'utf8'));
const marker = JSON.parse(await readFile(path.join(public3d, 'luminous-passage.ownership.json'), 'utf8'));
assert(marker.owner === 'kr8tiv-io/luminous-passage' && marker.promotion?.startsWith('transactional'), 'missing/invalid ownership marker');
assert(manifest.provenance?.blenderVersionPin === '5.2.x', 'missing Blender 5.2.x provenance pin');
assert(manifest.provenance?.blenderBuiltWith?.startsWith('5.2.'), 'assets were not built with Blender 5.2');
assert(manifest.provenance?.author && manifest.provenance?.license, 'missing author/license provenance');
assert(manifest.cameraHandoff?.fovAxis === 'vertical', 'camera handoff must use vertical FOV');
assert(manifest.exports?.map((item) => item.slug).join('|') === slugs.join('|'), 'manifest export slugs/order changed');
assert(new Set(manifest.exports.map((item) => item.file)).size === slugs.length, 'duplicate output file');
assert(manifest.exports.every((item) => item.file === `${item.slug}.glb`), 'output filename does not match slug');
const bindings = manifest.textureBindings ?? [];
const expectedBindingKeys = new Set([
  ...textureContract.surfaces.slice(0, -1).map((surface) => `${textureContract.flakeLibraryOutput}|Palette · ${surface}|${surface}`),
  ...textureContract.limestoneBoundOutputs.map((output) => `${output}|Floor · honed limestone|limestone-floor`),
]);
assert(bindings.length === expectedBindingKeys.size && new Set(bindings.map((item) => `${item.output}|${item.material}|${item.surface}`)).size === expectedBindingKeys.size && bindings.every((item) => expectedBindingKeys.has(`${item.output}|${item.material}|${item.surface}`)), 'missing, unexpected, or duplicate material/map-role bindings');
const bakedBySurface = new Map((manifest.bakedTextures ?? []).map((item) => [item.material, item.maps]));
assert(bakedBySurface.size === textureContract.surfaces.length && textureContract.surfaces.every((surface) => bakedBySurface.has(surface)), 'baked surface contract mismatch');
for (const surface of textureContract.surfaces) {
  const maps = bakedBySurface.get(surface);
  assert(Object.keys(maps).sort().join('|') === [...textureContract.roles].sort().join('|'), `${surface} PBR role set mismatch`);
  for (const mapPath of Object.values(maps)) {
    assert(typeof mapPath === 'string' && mapPath.startsWith('textures/luminous-passage/'), `${surface} map path must use textures/luminous-passage/`);
    assert((await stat(path.join(public3d, mapPath))).isFile(), `${surface} map path is missing from committed assets`);
  }
}
for (const binding of bindings) assert(Object.keys(binding.maps ?? {}).sort().join('|') === [...textureContract.roles].sort().join('|') && JSON.stringify(binding.maps) === JSON.stringify(bakedBySurface.get(binding.surface)), 'binding map roles differ from manifest declaration');
const bindingsByOutput = new Map();
for (const binding of bindings) bindingsByOutput.set(binding.output, [...(bindingsByOutput.get(binding.output) ?? []), binding]);

const topFiles = await readdir(public3d, { withFileTypes: true });
const rootOutputNames = new Set(topFiles.filter((item) => item.isFile()).map((item) => item.name));
const expectedRootOutputs = [...slugs.map((slug) => `${slug}.glb`), 'luminous-passage.manifest.json', 'luminous-passage.ownership.json'];
const expectedOwnedPaths = new Set([
  'assets/3d/luminous-passage.blend', ...slugs.map((slug) => `public/3d/${slug}.glb`),
  'public/3d/luminous-passage.manifest.json', 'public/3d/luminous-passage.ownership.json',
  'public/3d/posters/luminous-passage.jpg', 'public/3d/posters/luminous-passage-material-study.jpg',
  'public/3d/textures/luminous-passage',
]);
assert(new Set(marker.ownedPaths ?? []).size === expectedOwnedPaths.size && (marker.ownedPaths ?? []).every((item) => expectedOwnedPaths.has(item)), 'ownership marker allowlist mismatch');
assert(rootOutputNames.size === expectedRootOutputs.length && expectedRootOutputs.every((name) => rootOutputNames.has(name)), 'stale or missing top-level 3D output');
assert(topFiles.filter((item) => item.isDirectory()).map((item) => item.name).sort().join('|') === 'posters|textures', 'unexpected 3D output directory');
const actualGlbs = topFiles.filter((item) => item.isFile() && item.name.endsWith('.glb')).map((item) => item.name).sort();
const expectedGlbs = slugs.map((slug) => `${slug}.glb`).sort();
assert(actualGlbs.join('|') === expectedGlbs.join('|'), 'stale or missing GLB output');

let total = 0;
for (const item of manifest.exports) {
  const filename = path.join(public3d, item.file);
  const data = await readFile(filename);
  const { json, binLength, bin } = parseGlb(data, item.file);
  validateStructure(json, binLength, bin, item.file);
  for (const binding of bindingsByOutput.get(item.file) ?? []) {
    const material = (json.materials ?? []).find((candidate) => candidate.name === binding.material);
    assert(material, `${item.file} missing bound material ${binding.material}`);
    const pbr = material.pbrMetallicRoughness ?? {};
    const slots = { baseColor: pbr.baseColorTexture, roughness: pbr.metallicRoughnessTexture, normal: material.normalTexture };
    for (const [role, map] of Object.entries(binding.maps)) {
      const image = json.images[json.textures[slots[role].index].source];
      assert(path.parse(image.name ?? '').name === path.parse(map).name, `${item.file} ${binding.material} ${role} map differs from manifest`);
    }
  }
  assert((await stat(filename)).size === item.bytes && item.bytes <= item.budgetBytes, `${item.file} manifest size/budget mismatch`);
  total += item.bytes;
  if (item.slug === 'luminous-passage-camera') {
    const animation = json.animations?.[0];
    assert(json.cameras?.[0]?.type === 'perspective' && animation?.channels?.length >= 2, 'camera GLB missing perspective animation');
    const duration = Math.max(...animation.samplers.map((sampler) => json.accessors[sampler.input].max[0]));
    const verticalFov = json.cameras[0].perspective.yfov * 180 / Math.PI;
    assert(Math.abs(duration - manifest.cameraHandoff.durationSeconds) < .02, 'camera duration disagrees with manifest');
    assert(Math.abs(verticalFov - manifest.cameraHandoff.verticalFovDegrees) < .02, 'camera vertical FOV disagrees with manifest');
  }
}
assert(total <= manifest.budgets.totalBytes, 'total GLB budget exceeded');

const expectedTextures = new Set(manifest.bakedTextures.flatMap((item) => Object.values(item.maps).map((value) => value.replace('textures/luminous-passage/', ''))));
const textureRootEntries = await readdir(path.join(public3d, 'textures'));
assert(textureRootEntries.length === 1 && textureRootEntries[0] === 'luminous-passage', 'stale or unexpected texture directory output');
const actualTextures = new Set((await readdir(path.join(public3d, 'textures', 'luminous-passage'))).filter((name) => name.endsWith('.png')));
assert(expectedTextures.size === textureContract.surfaces.length * textureContract.roles.length && actualTextures.size === expectedTextures.size && [...actualTextures].every((name) => expectedTextures.has(name)), 'stale or missing baked PNG texture');
const posters = new Set(await readdir(path.join(public3d, 'posters')));
assert(posters.size === 2 && posters.has('luminous-passage.jpg') && posters.has('luminous-passage-material-study.jpg'), 'stale or missing poster render');
console.log(`Committed 3D assets validated: ${slugs.length} GLBs, ${expectedTextures.size} PNG maps, ${total.toLocaleString()} GLB bytes.`);
