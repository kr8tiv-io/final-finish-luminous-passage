import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const output = path.join(root, 'public/scenes/follow-floor-threshold');

function parseGlb(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.toString('ascii', 16, 20), 'JSON');
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binOffset = 20 + jsonLength;
  const binLength = bytes.readUInt32LE(binOffset);
  assert.equal(bytes.toString('ascii', binOffset + 4, binOffset + 8), 'BIN\0');
  return { json, bin: bytes.subarray(binOffset + 8, binOffset + 8 + binLength) };
}

function accessorFloats(gltf, bin, accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  assert.equal(accessor.componentType, 5126, 'camera animation accessors must use float32');
  const view = gltf.bufferViews[accessor.bufferView];
  const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
  assert.ok(width);
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = [];
  for (let row = 0; row < accessor.count; row += 1) {
    const item = [];
    for (let column = 0; column < width; column += 1) {
      item.push(bin.readFloatLE(offset + row * (view.byteStride ?? width * 4) + column * 4));
    }
    values.push(width === 1 ? item[0] : item);
  }
  return values;
}

function jpegDimensions(bytes) {
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error('JPEG dimensions not found');
}

function triangles(gltf) {
  return gltf.meshes.flatMap((mesh) => mesh.primitives).reduce((sum, primitive) => {
    assert.ok(primitive.mode === undefined || primitive.mode === 4, 'only triangle primitives are expected');
    const count = primitive.indices === undefined
      ? gltf.accessors[primitive.attributes.POSITION].count
      : gltf.accessors[primitive.indices].count;
    return sum + count / 3;
  }, 0);
}

test('threshold package has an exact runtime and provenance contract', async () => {
  const [manifestBytes, glb, poster] = await Promise.all([
    readFile(path.join(output, 'manifest.json')),
    readFile(path.join(output, 'scene.glb')),
    readFile(path.join(output, 'poster.jpg')),
  ]);
  const manifest = JSON.parse(manifestBytes);
  const { json: gltf, bin } = parseGlb(glb);

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.id, 'follow-floor-threshold');
  assert.deepEqual(manifest.transition, { from: 'garage', to: 'vault' });
  assert.equal(manifest.units, 'metres');
  assert.deepEqual(manifest.axes, { up: 'Y', forward: '-Z' });
  assert.deepEqual(jpegDimensions(poster), { width: 960, height: 540 });
  assert.equal(manifest.poster.bytes, poster.length);
  assert.equal(manifest.poster.sha256, createHash('sha256').update(poster).digest('hex'));
  assert.equal(manifest.poster.timeSeconds, 0);
  assert.equal(manifest.poster.frame, 0);
  assert.equal(manifest.scene.bytes, glb.length);
  assert.equal(manifest.scene.sha256, createHash('sha256').update(glb).digest('hex'));
  assert.equal(manifest.provenance.source, 'tools/blender/build_follow_floor_threshold.py');
  assert.match(manifest.provenance.blenderBuiltWith, /^5\.2\./);

  const nodeNames = new Set(gltf.nodes.map((node) => node.name));
  for (const name of ['FFT_Set_Root', 'FFT_Floor_Coated', 'FFT_Portal', 'FFT_Portal_Return_Left', 'FFT_Portal_Return_Right', 'FFT_Experience_Camera']) {
    assert.ok(nodeNames.has(name), `missing ${name}`);
  }
  const floorNode = gltf.nodes.find((node) => node.name === manifest.floorMesh);
  assert.ok(Number.isInteger(floorNode.mesh), 'floor node must own one mesh');
  assert.equal(gltf.meshes[floorNode.mesh].name, 'FFT_Floor_Coated');
  const portalNode = gltf.nodes.find((node) => node.name === 'FFT_Portal');
  const portalPosition = gltf.accessors[gltf.meshes[portalNode.mesh].primitives[0].attributes.POSITION];
  assert.ok(portalPosition.max[0] - portalPosition.min[0] >= 3.4 && portalPosition.max[0] - portalPosition.min[0] <= 4.2);
  const materialNames = new Set(gltf.materials.map((material) => material.name));
  assert.ok(materialNames.has('FFT_Warm_Bronze_Reveal'));
  assert.ok(!materialNames.has('FFT_Architectural_Ink'));

  const cameraNodeIndex = gltf.nodes.findIndex((node) => node.name === manifest.camera.node);
  const cameraNode = gltf.nodes[cameraNodeIndex];
  assert.ok(Number.isInteger(cameraNode.camera));
  assert.equal(gltf.cameras[cameraNode.camera].type, 'perspective');
  const horizontalFov = 2 * Math.atan(Math.tan(gltf.cameras[cameraNode.camera].perspective.yfov / 2) * (960 / 540)) * 180 / Math.PI;
  assert.ok(Math.abs(horizontalFov - manifest.camera.horizontalFovDegrees) < 0.05);

  const animation = gltf.animations.find((item) => item.name === manifest.camera.clip);
  assert.ok(animation, 'named camera clip must survive glTF export');
  const cameraChannels = animation.channels.filter((channel) => channel.target.node === cameraNodeIndex);
  assert.deepEqual(new Set(cameraChannels.map((channel) => channel.target.path)), new Set(['translation', 'rotation']));
  const translationChannel = cameraChannels.find((channel) => channel.target.path === 'translation');
  const times = accessorFloats(gltf, bin, animation.samplers[translationChannel.sampler].input);
  const positions = accessorFloats(gltf, bin, animation.samplers[translationChannel.sampler].output);
  assert.ok(times.length >= 3);
  assert.ok(Math.abs(times.at(-1) - manifest.camera.durationSeconds) < 0.02);
  for (const keyframe of manifest.camera.keyframes) {
    const index = times.findIndex((time) => Math.abs(time - keyframe.time) < 0.02);
    assert.notEqual(index, -1, `missing camera sample at ${keyframe.time}s`);
    positions[index].forEach((value, axis) => assert.ok(Math.abs(value - keyframe.position[axis]) < 0.02));
  }

  assert.ok((gltf.extensionsUsed ?? []).includes('KHR_lights_punctual'));
  assert.ok((gltf.extensions?.KHR_lights_punctual?.lights ?? []).some((light) => light.type === 'directional'));
  assert.ok(triangles(gltf) > 100 && triangles(gltf) < 20_000, 'scene must be detailed but compact');
});
