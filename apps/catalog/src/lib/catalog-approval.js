// C3-R41 — synthetic-development-only Ed25519 approval boundary. No I/O.
import { createHash, createPublicKey, verify as edVerify } from 'node:crypto';
import { loadVerifiedCatalog } from './catalog-contract.js';

const DOMAIN = Buffer.from('ALP:C3-R41:SYNTHETIC-DEVELOPMENT:v1\\0'.replace('\\0','\0'));
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
export class CatalogApprovalError extends Error {
  constructor(message) { super(message); this.name = 'CatalogApprovalError'; }
}
function fail(msg) { throw new CatalogApprovalError(msg); }
function plain(v) { return v !== null && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v)); }
function exact(v, fields, where) {
  if (!plain(v) || Object.keys(v).sort().join('|') !== [...fields].sort().join('|')) fail(where + ': schema mismatch');
}
function binary(v, where) {
  if (!(v instanceof Uint8Array)) fail(where + ': binary required');
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}
const sha = (data) => createHash('sha256').update(data).digest('hex');
function canonical(v, where) {
  const raw = binary(v, where);
  let parsed;
  try { parsed = JSON.parse(raw.toString('utf8')); } catch { fail(where + ': malformed JSON'); }
  if (!raw.equals(Buffer.from(JSON.stringify(parsed, null, 2) + '\n'))) fail(where + ': noncanonical JSON');
  return parsed;
}
function normalizeClaims(c) {
  exact(c, ['version','scope','environment','approvalId','keyId','manifestSha256','provenanceSha256'], 'claims');
  if (c.version !== 1 || c.scope !== 'catalog-synthetic-development-review' || c.environment !== 'development') {
    fail('publication or production scope forbidden');
  }
  for (const id of [c.approvalId, c.keyId]) if (typeof id !== 'string' || id.length > 80 || !ID.test(id)) fail('invalid approval/key ID');
  if (!HASH.test(c.manifestSha256) || !HASH.test(c.provenanceSha256)) fail('bad approval digest');
  return Object.freeze({
    version:1, scope:'catalog-synthetic-development-review', environment:'development',
    approvalId:c.approvalId, keyId:c.keyId,
    manifestSha256:c.manifestSha256, provenanceSha256:c.provenanceSha256
  });
}
export function makeDevelopmentClaims({ approvalId, keyId, manifestBytes, provenanceBytes }) {
  return normalizeClaims({
    version:1, scope:'catalog-synthetic-development-review', environment:'development',
    approvalId,keyId,
    manifestSha256:sha(binary(manifestBytes,'manifestBytes')),
    provenanceSha256:sha(binary(provenanceBytes,'provenanceBytes'))
  });
}
export function approvalSigningBytes(claims) {
  return Buffer.concat([DOMAIN, Buffer.from(JSON.stringify(normalizeClaims(claims)))]);
}
export async function signDevelopmentClaims(claims, { signDetached } = {}) {
  if (typeof signDetached !== 'function') fail('external signing action required');
  const signature = binary(await signDetached(approvalSigningBytes(claims)), 'signature');
  if (signature.length !== 64) fail('Ed25519 detached signature must be 64 bytes');
  return Object.freeze({
    formatVersion:1, algorithm:'Ed25519', claims:normalizeClaims(claims),
    signature:signature.toString('base64url')
  });
}
/** The trust registry MUST be owner-provided, never read from the signed envelope. */
export async function verifyDevelopmentCatalogApproval({
  approval, trustedKeys, manifestBytes, provenanceBytes, fixtureBytes, generatorBytes, readAsset
}) {
  exact(approval, ['formatVersion','algorithm','claims','signature'], 'approval');
  if (approval.formatVersion !== 1 || approval.algorithm !== 'Ed25519') fail('unsupported signature algorithm');
  const claims = normalizeClaims(approval.claims);
  if (typeof approval.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(approval.signature)) fail('bad signature encoding');
  const signature = Buffer.from(approval.signature, 'base64url');
  if (signature.length !== 64 || signature.toString('base64url') !== approval.signature) fail('noncanonical signature');
  if (!(trustedKeys instanceof Map)) fail('independent owner trust map required');
  const trusted = trustedKeys.get(claims.keyId);
  exact(trusted, ['publicKey','scope','revoked'], 'trust entry');
  if (trusted.scope !== 'catalog-synthetic-development-review' || trusted.revoked !== false) fail('untrusted/revoked key');
  let publicKey;
  if (typeof trusted.publicKey !== 'string' || !trusted.publicKey.startsWith('-----BEGIN PUBLIC KEY-----')) {
    fail('trust registry requires public-only SPKI PEM');
  }
  try { publicKey = createPublicKey(trusted.publicKey); } catch { fail('bad public key'); }
  if (publicKey.asymmetricKeyType !== 'ed25519' ||
      !edVerify(null, approvalSigningBytes(claims), publicKey, signature)) fail('signature verification failed');
  const rawManifest = binary(manifestBytes,'manifestBytes');
  const rawProvenance = binary(provenanceBytes,'provenanceBytes');
  if (sha(rawManifest) !== claims.manifestSha256 || sha(rawProvenance) !== claims.provenanceSha256) fail('signed bytes drifted');
  const manifest = canonical(rawManifest,'manifest');
  const provenance = canonical(rawProvenance,'provenance');
  exact(provenance, ['evidenceVersion','status','generator','generatorSha256','source','sourceSha256','artifacts'], 'provenance');
  if (provenance.evidenceVersion !== 1 ||
      provenance.status !== 'unsigned-synthetic-no-publication-authority' ||
      provenance.generator !== 'infrastructure/scripts/c3-build-sample.mjs' ||
      provenance.source !== 'apps/catalog/fixtures/demo-triangle.json') fail('unapproved source');
  if (sha(binary(fixtureBytes,'fixtureBytes')) !== provenance.sourceSha256 ||
      sha(binary(generatorBytes,'generatorBytes')) !== provenance.generatorSha256) fail('provenance chain mismatch');
  if (!Array.isArray(provenance.artifacts) || provenance.artifacts.length !== 2) fail('artifact count mismatch');
  const [assetEvidence, manifestEvidence] = provenance.artifacts;
  exact(assetEvidence,['path','sha256','byteLength'],'asset evidence');
  exact(manifestEvidence,['path','sha256','byteLength'],'manifest evidence');
  if (assetEvidence.path !== 'apps/catalog/sample/assets/demonstration/demo-triangle.glb' ||
      manifestEvidence.path !== 'apps/catalog/sample/catalog-manifest.json' ||
      manifestEvidence.sha256 !== sha(rawManifest) ||
      manifestEvidence.byteLength !== rawManifest.length) fail('manifest evidence mismatch');
  const verified = await loadVerifiedCatalog(manifest, {readAsset});
  if (verified.records.length !== 1 || verified.assets.length !== 1 ||
      verified.records[0].id !== 'demo-triangle' ||
      verified.assets[0].id !== 'demo-triangle' ||
      verified.assets[0].path !== 'assets/demonstration/demo-triangle.glb' ||
      assetEvidence.sha256 !== verified.assets[0].sha256 ||
      assetEvidence.byteLength !== verified.assets[0].byteLength) fail('asset provenance mismatch');
  return Object.freeze({
    approvedFor:'synthetic-development-testing-only',
    approvalId:claims.approvalId, keyId:claims.keyId,
    records:verified.records, publicationAuthorized:false, deploymentAuthorized:false
  });
}
