/**
 * C3-R39: Pure, read-only catalog manifest boundary.
 * No DOM, filesystem, network, evaluation, or publication authority.
 */
export const CATALOG_SCHEMA_VERSION = 1;
const HEX = /^[a-f0-9]{64}$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RELATIVE_ASSET = /^assets\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/[a-zA-Z0-9_-]+\.(?:glb|gltf|bin)$/;
const ALLOWED_MIME = new Set(['model/gltf-binary', 'model/gltf+json', 'application/octet-stream']);
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_ITEMS = 1000;

export class CatalogContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatalogContractError';
  }
}
const fail = (message) => { throw new CatalogContractError(message); };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function keys(value, expected, where) {
  if (!object(value)) fail(`${where}: object required`);
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== [...expected].sort()[i])) {
    fail(`${where}: unexpected or missing properties`);
  }
}
function identifier(value, where) {
  if (typeof value !== 'string' || value.length > 80 || !ID.test(value)) fail(`${where}: invalid identifier`);
}
function title(value, where) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 160 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(`${where}: invalid title`);
  }
}
function freezeRecord(record) { return Object.freeze({ ...record }); }

/** Validate an untrusted JSON-shaped manifest; return a deeply frozen normalized copy. */
export function validateCatalogManifest(input) {
  keys(input, ['schemaVersion', 'records', 'assets'], 'manifest');
  if (input.schemaVersion !== CATALOG_SCHEMA_VERSION) fail('unsupported catalog schema version');
  if (!Array.isArray(input.records) || input.records.length > MAX_ITEMS) fail('records: invalid collection');
  if (!Array.isArray(input.assets) || input.assets.length > MAX_ITEMS) fail('assets: invalid collection');
  const assets = new Map();
  const paths = new Set();
  const normalizedAssets = input.assets.map((asset, i) => {
    const where = `assets[${i}]`;
    keys(asset, ['id', 'path', 'sha256', 'byteLength', 'mimeType'], where);
    identifier(asset.id, `${where}.id`);
    if (typeof asset.path !== 'string' || !RELATIVE_ASSET.test(asset.path) || asset.path.includes('..')) fail(`${where}: unsafe asset path`);
    if (typeof asset.sha256 !== 'string' || !HEX.test(asset.sha256)) fail(`${where}: invalid SHA-256`);
    if (!Number.isSafeInteger(asset.byteLength) || asset.byteLength < 1 || asset.byteLength > MAX_ASSET_BYTES) fail(`${where}: invalid byte length`);
    if (!ALLOWED_MIME.has(asset.mimeType)) fail(`${where}: unsupported MIME type`);
    if (assets.has(asset.id) || paths.has(asset.path)) fail(`${where}: duplicate asset ID or path`);
    assets.set(asset.id, asset);
    paths.add(asset.path);
    return freezeRecord(asset);
  });
  const recordIds = new Set();
  const normalizedRecords = input.records.map((record, i) => {
    const where = `records[${i}]`;
    keys(record, ['id', 'title', 'assetId'], where);
    identifier(record.id, `${where}.id`);
    title(record.title, `${where}.title`);
    identifier(record.assetId, `${where}.assetId`);
    if (recordIds.has(record.id)) fail(`${where}: duplicate record ID`);
    if (!assets.has(record.assetId)) fail(`${where}: missing asset reference`);
    recordIds.add(record.id);
    return freezeRecord(record);
  });
  if (normalizedAssets.length !== normalizedRecords.length && normalizedRecords.length === 0 && normalizedAssets.length > 0) {
    fail('unreferenced assets are prohibited');
  }
  const referenced = new Set(normalizedRecords.map((r) => r.assetId));
  if (normalizedAssets.some((asset) => !referenced.has(asset.id))) fail('unreferenced assets are prohibited');
  return Object.freeze({
    schemaVersion: CATALOG_SCHEMA_VERSION,
    records: Object.freeze(normalizedRecords),
    assets: Object.freeze(normalizedAssets)
  });
}
function bytesOf(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  fail('asset reader must return binary bytes');
}
function toHex(bytes) { return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); }

/**
 * Reader is injected and must resolve to binary bytes. No implicit fetch.
 * Both length and SHA-256 are checked before exposing any record.
 * An empty manifest requires no reader and yields an empty snapshot.
 */
export async function loadVerifiedCatalog(input, { readAsset, cryptoProvider = globalThis.crypto } = {}) {
  const manifest = validateCatalogManifest(input);
  if (manifest.assets.length === 0) return manifest;
  if (typeof readAsset !== 'function') fail('verified asset reader required');
  if (!cryptoProvider?.subtle?.digest) fail('WebCrypto SHA-256 required');
  for (const asset of manifest.assets) {
    const raw = await readAsset(asset.path);
    const bytes = bytesOf(raw);
    if (bytes.byteLength !== asset.byteLength) fail(`integrity mismatch: ${asset.id} length`);
    const digest = toHex(new Uint8Array(await cryptoProvider.subtle.digest('SHA-256', bytes)));
    if (digest !== asset.sha256) fail(`integrity mismatch: ${asset.id} SHA-256`);
  }
  return manifest;
}
