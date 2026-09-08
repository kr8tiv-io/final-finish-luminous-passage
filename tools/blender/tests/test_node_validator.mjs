import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const sourceAssets = path.join(root, 'public', '3d');
const validator = path.join(root, 'tools', 'blender', 'validate-committed-assets.mjs');

async function expectFixtureFailure(mutate) {
  const temp = await mkdtemp(path.join(tmpdir(), 'luminous-passage-node-validator-'));
  const fixtureAssets = path.join(temp, '3d');
  try {
    await cp(sourceAssets, fixtureAssets, { recursive: true });
    const manifestPath = path.join(fixtureAssets, 'luminous-passage.manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    mutate(manifest);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = spawnSync(process.execPath, [validator], {
      encoding: 'utf8',
      env: { ...process.env, LP_3D_ROOT: fixtureAssets },
    });
    assert.notEqual(result.status, 0, `fixture unexpectedly passed:\n${result.stdout}${result.stderr}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

test('rejects a bare baked texture path', async () => {
  await expectFixtureFailure((manifest) => {
    manifest.bakedTextures[0].maps.baseColor = 'alabaster-snow-basecolor.png';
  });
});

test('rejects a prefixed baked texture path without a committed file', async () => {
  await expectFixtureFailure((manifest) => {
    manifest.bakedTextures[0].maps.baseColor = 'textures/luminous-passage/not-committed.png';
  });
});

test('rejects duplicate texture bindings', async () => {
  await expectFixtureFailure((manifest) => {
    const first = manifest.textureBindings[0];
    manifest.textureBindings.push({ ...first, maps: { ...first.maps } });
  });
});
