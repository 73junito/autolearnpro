import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateOwnerReview} from '../infrastructure/scripts/c3-r66-owner-review.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url));
const ledger=JSON.parse(fs.readFileSync(new URL('../docs/c3-r66/owner-review-ledger.json',import.meta.url),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const copy=x=>structuredClone(x);
function fixture(callback){
  // All temporary fixtures remain within F:\autolearnpro repository and are deleted.
  const dir=fs.mkdtempSync(path.join(repo,'c3-r66-test-'));
  const rel='C3-R58-OWNER-SESSIONS/owner-test-evidence.txt';
  const file=path.join(dir,rel);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const bytes=Buffer.from('Synthetic test-only owner observations, not a real NVDA capture.\n');
  fs.writeFileSync(file,bytes);
  const l=copy(ledger);
  l.entries=[{
    caseId:'nvda-windows-chromium',tester:'owner-01',reviewer:'owner-01',
    testedOn:'2026-11-20',reviewedOn:'2026-11-20',
    sourceCommit:'d1078d81b55021bab94d0842814af7c3a083adde',
    outcome:'OWNER_REVIEWED',observations:'Synthetic unit-test-only owner review; no actual human session is represented.',
    ownerAttestation:'I attest that this is a synthetic unit-test fixture only, not a genuine test report.',
    evidence:[{reference:rel,sha256:sha(bytes)}]
  }];
  try{callback({dir,file,ledger:l});}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('empty ledger validates but records zero owner and zero independent reviews',()=>{
  const r=validateOwnerReview(ledger);
  assert.equal(r.internalOwnerReviews,0);
  assert.equal(r.independentlyReviewed,0);
  assert.equal(r.releaseStatus,'HOLD');
});
test('solo-owner reviewed synthetic fixture is accepted internally only',()=>fixture(({dir,ledger:l})=>{
  const r=validateOwnerReview(l,{root:dir});
  assert.deepEqual([r.internalOwnerReviews,r.independentlyReviewed,r.certification],[1,0,'NOT_CERTIFIED']);
}));
test('different reviewer rejected rather than misrepresented as owner-only',()=>fixture(({dir,ledger:l})=>{
  l.entries[0].reviewer='other-01';
  assert.throws(()=>validateOwnerReview(l,{root:dir}),/owner identity/);
}));
test('release and certification forgery is rejected',()=>fixture(({dir,ledger:l})=>{
  l.releaseStatus='READY';
  assert.throws(()=>validateOwnerReview(l,{root:dir}),/release or scope/);
}));
test('missing, tampered, duplicate and unscoped evidence rejected',()=>fixture(({dir,file,ledger:l})=>{
  fs.writeFileSync(file,'tampered');
  assert.throws(()=>validateOwnerReview(l,{root:dir}),/SHA-256 mismatch/);
  fs.rmSync(file);
  assert.throws(()=>validateOwnerReview(l,{root:dir}),/missing evidence/);
  l.entries[0].evidence[0].reference='../elsewhere';
  assert.throws(()=>validateOwnerReview(l,{root:dir}),/unscoped/);
}));
test('duplicates and invalid date chronology are rejected',()=>fixture(({dir,ledger:l})=>{
  l.entries.push(copy(l.entries[0]));
  assert.throws(()=>validateOwnerReview(l,{root:dir}),/duplicate case/);
  l.entries.pop();
  l.entries[0].reviewedOn='2026-11-19';
  assert.throws(()=>validateOwnerReview(l,{root:dir}),/chronology/);
}));

test('missing or non-first-person owner attestation cannot be approved',()=>fixture(({dir,ledger:l})=>{
  delete l.entries[0].ownerAttestation;
  assert.throws(()=>validateOwnerReview(l,{root:dir}),/malformed owner entry/);
  l.entries[0].ownerAttestation='This is not an actual first person declaration and should fail validation.';
  assert.throws(()=>validateOwnerReview(l,{root:dir}),/first-person owner attestation/);
}));
test('symlink evidence and symlink evidence ancestor are rejected',t=>fixture(({dir,file,ledger:l})=>{
  const original=fs.readFileSync(file);
  fs.rmSync(file);
  try {
    fs.symlinkSync(path.join(dir,'target.txt'),file,'file');
    assert.throws(()=>validateOwnerReview(l,{root:dir}),/symlink evidence/);
    fs.rmSync(file);
    const evidenceDir=path.dirname(file);
    fs.rmSync(evidenceDir,{recursive:true,force:true});
    const target=path.join(dir,'target-folder');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target,'owner-test-evidence.txt'),original);
    fs.symlinkSync(target,evidenceDir,'dir');
    assert.throws(()=>validateOwnerReview(l,{root:dir}),/symlink evidence/);
    fs.rmSync(evidenceDir);
  } catch (e) {
    if (e.code==='EPERM'||e.code==='EACCES') {
      t.skip('Windows host cannot create symlinks; Linux protected CI must exercise this negative case');
      return;
    }
    throw e;
  }
}));
test('protected workflow includes R66 without removing R54 R55 R56 R8',()=>{
  const f=fs.readFileSync(path.join(repo,'.github/workflows/r1-pr-validation.yml'),'utf8');
  const required=[
    'node infrastructure/scripts/c3-r54-manual-evidence.mjs --check',
    'node infrastructure/scripts/c3-r55-evidence-integrity.mjs --check',
    'node infrastructure/scripts/c3-r56-governance.mjs --check',
    'node infrastructure/scripts/c3-r66-owner-review.mjs --check',
    'node --test tests/c3-r66-owner-review.test.mjs',
    'npm run check:r8-release-hold'
  ];
  for (const token of required) assert.ok(f.includes(token),'missing CI gate '+token);
  const indexes=required.map(token=>f.indexOf(token));
  assert.deepEqual(indexes,[...indexes].sort((a,b)=>a-b),'protected gates reordered');
  assert.match(f,/permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(f,/\b(deploy|write)\s*:\s*(?:true|write)\b/i);
});
