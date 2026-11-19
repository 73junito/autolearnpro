import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import {
  CatalogApprovalError, approvalSigningBytes, makeDevelopmentClaims,
  signDevelopmentClaims, verifyDevelopmentCatalogApproval
} from '../apps/catalog/src/lib/catalog-approval.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url));
const manifestBytes = read('apps/catalog/sample/catalog-manifest.json');
const provenanceBytes = read('apps/catalog/sample/build-provenance.json');
const fixtureBytes = read('apps/catalog/fixtures/demo-triangle.json');
const generatorBytes = read('infrastructure/scripts/c3-build-sample.mjs');
const glb = read('apps/catalog/sample/assets/demonstration/demo-triangle.glb');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const { publicKey: untrustedKey } = generateKeyPairSync('ed25519');
const defaultClaims = () => makeDevelopmentClaims({
  approvalId:'r41-synthetic-review', keyId:'ephemeral-test-reviewer',
  manifestBytes, provenanceBytes
});
const sign = async (claims = defaultClaims()) => signDevelopmentClaims(claims, {
  signDetached: async message => edSign(null, message, privateKey)
});
const keys = () => new Map([['ephemeral-test-reviewer', {
  publicKey: publicKey.export({type:'spki',format:'pem'}), scope:'catalog-synthetic-development-review', revoked:false
}]]);
const args = (approval) => ({
  approval, trustedKeys:keys(), manifestBytes, provenanceBytes, fixtureBytes, generatorBytes,
  readAsset:async p => {
    assert.equal(p,'assets/demonstration/demo-triangle.glb');
    return glb;
  }
});
const rejected = async (input) => assert.rejects(
  () => verifyDevelopmentCatalogApproval(input), e =>
    e instanceof CatalogApprovalError || e?.name === 'CatalogContractError'
);

test('ephemeral Ed25519 signature grants synthetic testing only, never publication', async () => {
  const signed = await sign();
  const result = await verifyDevelopmentCatalogApproval(args(signed));
  assert.equal(result.approvedFor,'synthetic-development-testing-only');
  assert.equal(result.publicationAuthorized,false);
  assert.equal(result.deploymentAuthorized,false);
  assert.equal(result.records.length,1);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.records[0]));
});
test('signature uses stable domain-separated bytes', () => {
  const message = approvalSigningBytes(defaultClaims());
  assert.equal(message.subarray(0, 3).toString(),'ALP');
  assert.ok(message.toString().includes('catalog-synthetic-development-review'));
});
test('unsigned, empty, malformed and forged approvals fail closed', async () => {
  await rejected(args({}));
  const signed = await sign();
  await rejected(args({...signed, signature:'A'.repeat(86)}));
  await rejected(args({...signed, algorithm:'RSA'}));
  await rejected(args({...signed, publicKey:publicKey.export({type:'spki',format:'pem'})}));
  await rejected(args({...signed, claims:{...signed.claims, publicationAuthorized:true}}));
});
test('key IDs, revoked keys, external key mismatch and absent trust fail closed', async () => {
  const signed = await sign();
  await rejected({...args(signed),trustedKeys:new Map()});
  await rejected({...args(signed),trustedKeys:new Map([['ephemeral-test-reviewer',{
    publicKey:untrustedKey.export({type:'spki',format:'pem'}),scope:'catalog-synthetic-development-review',revoked:false
  }]])});
  await rejected({...args(signed),trustedKeys:new Map([['ephemeral-test-reviewer',{
    publicKey:privateKey.export({type:'pkcs8',format:'pem'}),scope:'catalog-synthetic-development-review',revoked:false
  }]])});
  await rejected({...args(signed),trustedKeys:new Map([['ephemeral-test-reviewer',{
    publicKey:publicKey.export({type:'spki',format:'pem'}),scope:'catalog-synthetic-development-review',revoked:true
  }]])});
  await rejected({...args(signed),trustedKeys:new Map([['ephemeral-test-reviewer',{
    publicKey:publicKey.export({type:'spki',format:'pem'}),scope:'production-publication',revoked:false
  }]])});
});
test('production/publishing scope and key substitution are rejected', async () => {
  const signed = await sign();
  await rejected(args({...signed,claims:{...signed.claims,environment:'production'}}));
  await rejected(args({...signed,claims:{...signed.claims,scope:'catalog-production-release'}}));
  await rejected(args({...signed,claims:{...signed.claims,keyId:'other-key'}}));
  assert.throws(()=>makeDevelopmentClaims({
    approvalId:'R41 INVALID',keyId:'ephemeral-test-reviewer',manifestBytes,provenanceBytes
  }),CatalogApprovalError);
});
test('tampered manifest, provenance, source and generator are rejected', async () => {
  const signed = await sign();
  for (const field of ['manifestBytes','provenanceBytes','fixtureBytes','generatorBytes']) {
    const original=args(signed);
    const next=Buffer.from(original[field]);
    next[0]^=1;
    await rejected({...original,[field]:next});
  }
});
test('modified or missing GLB cannot be approved', async () => {
  const signed=await sign();
  const corrupt=Buffer.from(glb);
  corrupt[corrupt.length-1]^=1;
  await rejected({...args(signed),readAsset:async()=>corrupt});
  await rejected({...args(signed),readAsset:async()=>Buffer.alloc(0)});
});
test('no signing callback, or non-Ed25519 signature length, can create an approval', async () => {
  await assert.rejects(()=>signDevelopmentClaims(defaultClaims()),CatalogApprovalError);
  await assert.rejects(()=>signDevelopmentClaims(defaultClaims(),{
    signDetached:async()=>Buffer.from('invalid')
  }),CatalogApprovalError);
});
