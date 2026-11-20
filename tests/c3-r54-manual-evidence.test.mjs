import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evidencePath,validateManualEvidence,loadAndVerify} from '../infrastructure/scripts/c3-r54-manual-evidence.mjs';

const original=JSON.parse(fs.readFileSync(evidencePath,'utf8'));
const clone=()=>structuredClone(original);
test('C3-R54 baseline validates but keeps all six human tests NOT_TESTED',()=>{
 const x=loadAndVerify();assert.equal(x.recordedCompleted,0);assert.equal(x.releaseStatus,'HOLD');
 assert.equal(original.checks.length,6);
});
test('reject removal, duplication or invented manual check',()=>{
 const missing=clone();missing.checks.pop();assert.throws(()=>validateManualEvidence(missing),/matrix incomplete/);
 const repeated=clone();repeated.checks[1].id=repeated.checks[0].id;assert.throws(()=>validateManualEvidence(repeated),/duplicated/);
});
test('reject forged certification or release authority',()=>{
 for(const [key,value] of [['releaseStatus','READY'],['certification','WCAG_CERTIFIED'],['manualAuthorization','GRANTED']]){
  const c=clone();c[key]=value;assert.throws(()=>validateManualEvidence(c),/release or certification/);
 }
});
test('reject forged PASS with missing human evidence',()=>{
 const c=clone();c.checks[0].status='PASS';assert.throws(()=>validateManualEvidence(c),/missing human tester/);
});
test('require traceable human details, digest and observations for completed checks',()=>{
 const c=clone(),x=c.checks[0];Object.assign(x,{
  status:'PASS',tester:'Human tester',testedOn:'2026-11-20',platformVersion:'version-recorded',
  browserVersion:'version-recorded',atVersion:'version-recorded',
  evidence:[{reference:'docs/c3-r54/evidence/test-case.md',sha256:'a'.repeat(64),observations:'Keyboard and announcements observed.'}]
 });
 assert.equal(validateManualEvidence(c).recordedCompleted,1);
 x.evidence[0].sha256='invalid';assert.throws(()=>validateManualEvidence(c),/digest absent/);
});
test('reject unresolved issue without issue reference and unsafe evidence paths',()=>{
 const c=clone(),x=c.checks[0];Object.assign(x,{
  status:'FAIL',tester:'Human tester',testedOn:'2026-11-20',platformVersion:'v1',
  browserVersion:'v1',atVersion:'v1',
  evidence:[{reference:'docs/c3-r54/evidence/test-case.md',sha256:'a'.repeat(64),observations:'Observed accessibility regression.'}]
 });
 assert.throws(()=>validateManualEvidence(c),/defect issue reference/);
 x.issue='https://github.com/73junito/autolearnpro/issues/42';assert.equal(validateManualEvidence(c).releaseStatus,'HOLD');
 x.evidence[0].reference='docs/c3-r54/evidence/../secrets';assert.throws(()=>validateManualEvidence(c),/untrusted evidence reference/);
});
