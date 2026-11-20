import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyIntegrity,verifyFiles,readEvidence} from '../infrastructure/scripts/c3-r55-evidence-integrity.mjs';

const manifest=JSON.parse(fs.readFileSync(new URL('../docs/c3-r54/manual-accessibility-evidence.json',import.meta.url)));
const reviews=JSON.parse(fs.readFileSync(new URL('../docs/c3-r55/manual-reviews.json',import.meta.url)));
const copy=o=>structuredClone(o);
const digest=x=>createHash('sha256').update(x).digest('hex');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'c3-r55-'));
 const reference='docs/c3-r54/evidence/manual-case.txt';
 const file=path.join(root,reference);
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const bytes=Buffer.from('Human-authored sample only for unit testing; not a real AT outcome.\n');
 fs.writeFileSync(file,bytes);
 const m=copy(manifest),r=copy(reviews),c=m.checks[0];
 Object.assign(c,{status:'PASS',tester:'tester-01',testedOn:'2026-11-20',
 platformVersion:'Windows 11 test fixture',browserVersion:'Firefox test fixture',
 atVersion:'NVDA test fixture',evidence:[{reference,sha256:digest(bytes),
 observations:'Synthetic unit test only; no actual screen reader tested.'}]});
 r.reviews.push({checkId:c.id,reviewer:'reviewer-02',reviewedOn:'2026-11-20',
 decision:'APPROVED',evidenceSha256:[digest(bytes)],
 notes:'Fixture-only independent review, not a real approval.'});
 try {fn({root,file,reference,m,r,c,bytes});} finally {fs.rmSync(root,{recursive:true,force:true});}
}
test('baseline has zero completed tests, empty reviews and HOLD',()=>{
 const result=verifyFiles();
 assert.deepEqual([result.recordedCompleted,result.independentlyReviewed,result.evidenceFiles],[0,0,0]);
 assert.equal(result.releaseStatus,'HOLD');assert.equal(result.certification,'NOT_CERTIFIED');
});
test('checked bytes and separate tester/reviewer accepted only as a fixture',()=>{
 fixture(({root,m,r})=>{
 const result=verifyIntegrity(m,r,{root});
 assert.equal(result.evidenceFiles,1);assert.equal(result.recordedCompleted,1);
 });
});
test('missing, tampered or replaced file is rejected',()=>{
 fixture(({root,file,m,r})=>{
 fs.writeFileSync(file,'different contents');
 assert.throws(()=>verifyIntegrity(m,r,{root}),/hash mismatch/);
 fs.rmSync(file);
 assert.throws(()=>verifyIntegrity(m,r,{root}),/missing or unsafe evidence/);
 });
});
test('symlink file and symlink ancestor are rejected',()=>{
 fixture(({root,file,m,r})=>{
 const elsewhere=path.join(root,'other.txt');fs.copyFileSync(file,elsewhere);
 fs.rmSync(file);fs.symlinkSync(elsewhere,file);
 assert.throws(()=>verifyIntegrity(m,r,{root}),/symlink/);
 fs.rmSync(file);
 const directory=path.dirname(file),alt=path.join(root,'alt');
 fs.renameSync(directory,alt);fs.symlinkSync(alt,directory,'dir');
 assert.throws(()=>verifyIntegrity(m,r,{root}),/symlink/);
 });
});
test('traversal and duplicate evidence references rejected',()=>{
 fixture(({root,m,r})=>{
 assert.throws(()=>readEvidence('docs/c3-r54/evidence/../secret.txt',{root}),/unsafe/);
 m.checks[1]=structuredClone(m.checks[0]);m.checks[1].id='nvda-windows-chromium';
 r.reviews.push({...r.reviews[0],checkId:'nvda-windows-chromium'});
 assert.throws(()=>verifyIntegrity(m,r,{root}),/duplicate evidence reference/);
 });
});
test('missing, same-person, duplicate, or mismatched reviewer denies signoff',()=>{
 fixture(({root,m,r})=>{
 const noReview=copy(r);noReview.reviews=[];
 assert.throws(()=>verifyIntegrity(m,noReview,{root}),/lacks independent human review/);
 const same=copy(r);same.reviews[0].reviewer='tester-01';
 assert.throws(()=>verifyIntegrity(m,same,{root}),/reviewer must differ/);
 const dup=copy(r);dup.reviews.push(copy(r.reviews[0]));
 assert.throws(()=>verifyIntegrity(m,dup,{root}),/duplicate review/);
 const wrong=copy(r);wrong.reviews[0].evidenceSha256=['b'.repeat(64)];
 assert.throws(()=>verifyIntegrity(m,wrong,{root}),/digest mismatch/);
 });
});
test('forged release, untested review and failed test approved are rejected',()=>{
 fixture(({root,m,r})=>{
 const released=copy(r);released.releaseStatus='READY';
 assert.throws(()=>verifyIntegrity(m,released,{root}),/review control missing/);
 const untested=copy(manifest),fake=copy(reviews);
 fake.reviews.push({...r.reviews[0]});
 assert.throws(()=>verifyIntegrity(untested,fake,{root}),/review cannot certify untested/);
 const failed=copy(m);failed.checks[0].status='FAIL';
 failed.checks[0].issue='https://github.com/73junito/autolearnpro/issues/42';
 assert.throws(()=>verifyIntegrity(failed,r,{root}),/decision incompatible/);
 });
});
test('malformed attestation, invalid dates and unreviewed test are rejected',()=>{
 fixture(({root,m,r})=>{
 const modified=copy(r);modified.reviews[0].reviewedOn='2026-02-30';
 assert.throws(()=>verifyIntegrity(m,modified,{root}),/chronology/);
 modified.reviews[0].reviewedOn='2026-11-20';
 modified.reviews[0].unauthorized='yes';
 assert.throws(()=>verifyIntegrity(m,modified,{root}),/malformed reviewer/);
 });
});
