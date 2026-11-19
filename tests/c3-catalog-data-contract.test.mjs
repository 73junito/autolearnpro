import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { validateCatalogManifest, loadVerifiedCatalog, CatalogContractError } from '../apps/catalog/src/lib/catalog-contract.js';

const data = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0, 1, 2, 3]);
const digest = createHash('sha256').update(data).digest('hex');
const sample = () => ({
  schemaVersion: 1,
  records: [{ id: 'brake-caliper-demo', title: 'Brake caliper demonstration', assetId: 'caliper-geometry' }],
  assets: [{ id: 'caliper-geometry', path: 'assets/demonstration/caliper.glb', sha256: digest, byteLength: data.byteLength, mimeType: 'model/gltf-binary' }]
});
const invalid = (mutate) => {
  const manifest = sample();
  mutate(manifest);
  assert.throws(() => validateCatalogManifest(manifest), CatalogContractError);
};

test('empty manifest is safe, immutable, and does not access an asset reader', async () => {
  const empty = { schemaVersion: 1, records: [], assets: [] };
  const result = await loadVerifiedCatalog(empty, { readAsset: () => { throw Error('unexpected access'); } });
  assert.deepEqual(result, empty);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.records));
});

test('valid records and assets are normalized into frozen copies', () => {
  const original = sample();
  const result = validateCatalogManifest(original);
  original.records[0].title = 'mutated';
  assert.equal(result.records[0].title, 'Brake caliper demonstration');
  assert.ok(Object.isFrozen(result.records[0]));
  assert.ok(Object.isFrozen(result.assets[0]));
});

test('unknown schema and fields are rejected', () => {
  invalid((m) => { m.schemaVersion = 2; });
  invalid((m) => { m.admin = true; });
  invalid((m) => { m.records[0].isPublished = true; });
  invalid((m) => { m.assets[0].url = 'https://example.com/asset.glb'; });
});
test('bad identities and references are rejected', () => {
  invalid((m) => { m.records[0].id = '../escape'; });
  invalid((m) => { m.records.push({ ...m.records[0] }); });
  invalid((m) => { m.assets.push({ ...m.assets[0], id: 'other' }); });
  invalid((m) => { m.records[0].assetId = 'missing'; });
  invalid((m) => { m.assets[0].id = 'MALFORMED'; });
});
test('unsafe asset paths and metadata are rejected', () => {
  for (const path of ['https://example.com/a.glb', '../private.glb', 'assets/../secret.glb', '/assets/a.glb', 'assets/a%2fb.glb', 'assets/a.js', 'assets/a\\b.glb']) {
    invalid((m) => { m.assets[0].path = path; });
  }
  invalid((m) => { m.assets[0].byteLength = -1; });
  invalid((m) => { m.assets[0].byteLength = 26 * 1024 * 1024; });
  invalid((m) => { m.assets[0].sha256 = 'not-a-digest'; });
  invalid((m) => { m.assets[0].mimeType = 'text/html'; });
  invalid((m) => { m.records[0].title = '<control>\n'; });
});
test('orphaned assets and excessive collections are rejected', () => {
  invalid((m) => { m.records = []; });
  invalid((m) => { m.records = Array.from({ length: 1001 }, (_, i) => ({ id: `record-${i}`, title: 'Test', assetId: 'caliper-geometry' })); });
});
test('verified asset bytes are accepted using an injected reader', async () => {
  const called = [];
  const result = await loadVerifiedCatalog(sample(), { readAsset: async (path) => { called.push(path); return data; }, cryptoProvider: webcrypto });
  assert.equal(result.records.length, 1);
  assert.deepEqual(called, ['assets/demonstration/caliper.glb']);
});
test('missing reader, wrong byte length, and wrong digest fail closed', async () => {
  await assert.rejects(loadVerifiedCatalog(sample()), CatalogContractError);
  await assert.rejects(loadVerifiedCatalog(sample(), { readAsset: async () => new Uint8Array([1]), cryptoProvider: webcrypto }), CatalogContractError);
  await assert.rejects(loadVerifiedCatalog(sample(), { readAsset: async () => new Uint8Array(data.byteLength), cryptoProvider: webcrypto }), CatalogContractError);
  await assert.rejects(loadVerifiedCatalog(sample(), { readAsset: async () => 'text', cryptoProvider: webcrypto }), CatalogContractError);
});
test('integrity rejection never returns partially verified records', async () => {
  const item = sample();
  const secondBytes = new Uint8Array([2, 3, 4]);
  item.assets.push({ id: 'second-model', path: 'assets/demonstration/second.glb', sha256: createHash('sha256').update(secondBytes).digest('hex'), byteLength: secondBytes.length, mimeType: 'model/gltf-binary' });
  item.records.push({ id: 'second-example', title: 'Second example', assetId: 'second-model' });
  await assert.rejects(loadVerifiedCatalog(item, {
    readAsset: async (path) => path.endsWith('/second.glb') ? data : data,
    cryptoProvider: webcrypto
  }), CatalogContractError);
});
