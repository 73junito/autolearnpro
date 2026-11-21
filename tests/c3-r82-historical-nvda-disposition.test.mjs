import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateHistoricalDisposition,verifyHistoricalDisposition} from '../infrastructure/scripts/c3-r82-historical-nvda-disposition.mjs';

const parse=relative=>JSON.parse(fs.readFileSync(new URL('../'+relative,import.meta.url),'utf8'));
const base=parse('docs/c3-r82/historical-nvda-disposition.json');
const policy=parse('docs/c3-r75/sole-human-policy.json');
const r54=parse('docs/c3-r54/manual-accessibility-evidence.json');
const r66=parse('docs/c3-r66/owner-review-ledger.json');
const workflow=fs.readFileSync(new URL('../.github/workflows/r1-pr-validation.yml',import.meta.url),'utf8');
const copy=structuredClone;
const input=()=>({workflow,ownerPolicy:copy(policy),r54:copy(r54),r66:copy(r66)});
const reject=(mutate,regex)=>{const d=copy(base);mutate(d);assert.throws(()=>validateHistoricalDisposition(d,input()),regex);};

test('current archival disposition is valid, not native NVDA acceptance',()=>{
  const r=verifyHistoricalDisposition();
  assert.equal(r.historicalDisposition,'CLOSED_WITH_DISCLOSED_LIMITATIONS');
  assert.equal(r.nativeSpeechCompleteness,'NOT_VERIFIED');
  assert.equal(r.evidenceEntries,3);
  assert.equal(r.unverifiedManualItems,5);
  assert.equal(r.independentlyReviewed,false);
  assert.equal(r.releaseStatus,'HOLD');
});
test('cannot silently promote archival closure to completed manual tests',()=>{
  reject(d=>{d.historicalDisposition='FULLY_ACCEPTED'},/historic evidence/);
  reject(d=>{d.historicalFormalManualAcceptance='COMPLETED'},/historic evidence/);
  reject(d=>{d.historicalNativeSpeechCompleteness='VERIFIED'},/historic evidence/);
});
test('cannot claim a recovered original indexed-cube capture',()=>{
  reject(d=>{d.evidence[2].status='NATIVE_ORIGINAL_VERIFIED'},/provenance/);
  reject(d=>{d.evidence[2].kind='OWNER_IDENTIFIED_ORIGINAL_SPEECH_TEXT'},/provenance/);
});
test('cannot treat the longer triangle derivative as native source',()=>{
  reject(d=>{d.evidence[1].kind='OWNER_IDENTIFIED_ORIGINAL_SPEECH_TEXT'},/provenance/);
  reject(d=>{d.evidence[1].status='RAW_CAPTURE_IDENTICAL'},/provenance/);
});
test('cannot tamper with byte counts, hashes or introduce private raw content',()=>{
  reject(d=>{d.evidence[0].bytes+=1},/provenance/);
  reject(d=>{d.evidence[0].sha256='0'.repeat(64)},/provenance/);
  reject(d=>{d.evidence[0].originalText='private chrome window'},/unexpected evidence fields/);
  reject(d=>{d.evidence[0].location='C:\\Users\\rod63\\Downloads'},/privacy/);
});
test('cannot drop unresolved manual-only cases',()=>{
  reject(d=>{d.manualOnlyGaps.pop()},/unverified manual/);
  reject(d=>{d.manualOnlyGaps[2]='VERIFIED'},/unverified manual/);
});
test('cannot relabel browser automation as native NVDA',()=>{
  reject(d=>{d.engineeringVerification.kind='NATIVE_NVDA_COMPLETE'},/browser verification/);
  reject(d=>{d.engineeringVerification.mergedMainAtClosure='f'.repeat(40)},/browser verification/);
});
test('cannot require a second human or grant production release',()=>{
  reject(d=>{d.secondHumanRequiredForDevelopment=true},/human reviewer/);
  reject(d=>{d.ownerReviewMode='INDEPENDENT'},/human reviewer/);
  reject(d=>{d.releaseStatus='READY'},/release controls/);
  reject(d=>{d.certification='CERTIFIED'},/release controls/);
  reject(d=>{d.manualAuthorization='GRANTED'},/release controls/);
});
test('old historical completion counters cannot be fabricated',()=>{
  reject(d=>{d.r54FormalCompletionAtClosure=6},/historical zero/);
  reject(d=>{d.r66OwnerEntriesAtClosure=1},/historical zero/);
});
test('CI cannot drop historical gate or prior governance/release safeguards',()=>{
  for(const token of [
    'node infrastructure/scripts/c3-r54-manual-evidence.mjs --check',
    'node infrastructure/scripts/c3-r55-evidence-integrity.mjs --check',
    'node infrastructure/scripts/c3-r56-governance.mjs --check',
    'node infrastructure/scripts/c3-r66-owner-review.mjs --check',
    'node infrastructure/scripts/c3-r75-sole-human-workflow.mjs --check',
    'node infrastructure/scripts/c3-r82-historical-nvda-disposition.mjs --check',
    'node --test tests/c3-r82-historical-nvda-disposition.test.mjs',
    'npm run check:r8-release-hold']){
    assert.throws(()=>validateHistoricalDisposition(base,{...input(),workflow:workflow.replace(token,'REMOVED')}),
      /missing CI safeguard/);
  }
});
test('malformed metadata and missing limitations are rejected',()=>{
  reject(d=>{d.unknown=true},/unexpected or missing/);
  reject(d=>{d.closureNote='done'},/closure limitations/);
  assert.throws(()=>validateHistoricalDisposition(base,{...input(),ownerPolicy:{...policy,reviewMode:'INDEPENDENT'}}),
    /R75 owner governance/);
});
