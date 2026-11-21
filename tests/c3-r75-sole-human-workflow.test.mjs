import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateSoleHumanPolicy,repoRoot,verifySoleHumanPolicy} from '../infrastructure/scripts/c3-r75-sole-human-workflow.mjs';

const policy=JSON.parse(fs.readFileSync(new URL('../docs/c3-r75/sole-human-policy.json',import.meta.url),'utf8'));
const manual=JSON.parse(fs.readFileSync(new URL('../docs/c3-r54/manual-accessibility-evidence.json',import.meta.url),'utf8'));
const ownerLedger=JSON.parse(fs.readFileSync(new URL('../docs/c3-r66/owner-review-ledger.json',import.meta.url),'utf8'));
const workflow=fs.readFileSync(new URL('../.github/workflows/r1-pr-validation.yml',import.meta.url),'utf8');
const clone=o=>structuredClone(o);
const opts=()=>({workflow,manual:clone(manual),ownerLedger:clone(ownerLedger)});

test('actual repository sole-owner policy and HOLD checks pass',()=>{
  const r=verifySoleHumanPolicy();
  assert.equal(r.humanDevelopers,1);
  assert.equal(r.humanReviewers,1);
  assert.equal(r.secondHumanReviewerRequired,false);
  assert.equal(r.independentlyReviewedClaimed,false);
  assert.equal(r.formalR54Completed,0);
  assert.equal(r.ownerLedgerEntries,0);
  assert.equal(r.releaseStatus,'HOLD');
  assert.ok(repoRoot);
});
test('never require or forge independent developer, tester or reviewer',()=>{
  for(const [key,value] of [
    ['humanDeveloperCount',2],['humanMaintainerCount',2],['humanTesterCount',2],
    ['humanReviewerCount',2],['secondHumanReviewerRequired',true],
    ['independentHumanVerificationRequiredForDevelopment',true],
    ['reviewMode','INDEPENDENT_REVIEWED']]){
    const p=clone(policy);p[key]=value;
    assert.throws(()=>validateSoleHumanPolicy(p,opts()),/sole human roles|independent person/);
  }
});
test('R55/R56 optional separate formal path cannot be mislabeled',()=>{
  const p=clone(policy);p.legacyR55R56='DISABLED_OR_BYPASSED';
  assert.throws(()=>validateSoleHumanPolicy(p,opts()),/legacy formal review/);
});
test('fabricated completion and certification are denied',()=>{
  for(const [key,value] of [
    ['r54FormalCasesCompleted',6],['r66FormalOwnerReviewsCompleted',1],
    ['ownerEvidenceStatus','FULLY_CERTIFIED'],['releaseStatus','READY'],
    ['certification','WCAG_CERTIFIED'],['manualAuthorization','GRANTED']]){
    const p=clone(policy);p[key]=value;
    assert.throws(()=>validateSoleHumanPolicy(p,opts()),/fabricated|legacy formal review|release\/certification/);
  }
});
test('missing R54, R55, R56, R66, R75 or R8 CI gates are denied',()=>{
  for(const needle of [
    'node infrastructure/scripts/c3-r54-manual-evidence.mjs --check',
    'node infrastructure/scripts/c3-r55-evidence-integrity.mjs --check',
    'node infrastructure/scripts/c3-r56-governance.mjs --check',
    'node infrastructure/scripts/c3-r66-owner-review.mjs --check',
    'node infrastructure/scripts/c3-r75-sole-human-workflow.mjs --check',
    'node --test tests/c3-r75-sole-human-workflow.test.mjs',
    'npm run check:r8-release-hold']){
    assert.throws(()=>validateSoleHumanPolicy(policy,{...opts(),workflow:workflow.replace(needle,'REMOVED')}),
      /CI guard missing|negative-control tests missing|R8 HOLD gate missing/);
  }
});
test('no CI text falsely claiming an independent reviewer',()=>{
  const changed=workflow.replace('No second human reviewer required for internal development',
    'Independent human review required');
  assert.throws(()=>validateSoleHumanPolicy(policy,{...opts(),workflow:changed}),
    /sole human CI statement missing/);
});
test('actual ledger data contradicting hardcoded counts is denied',()=>{
  const m=clone(manual);m.checks[0].status='PASS';
  assert.throws(()=>validateSoleHumanPolicy(policy,{...opts(),manual:m}),/R54 case count/);
  const o=clone(ownerLedger);o.entries.push({caseId:'synthetic-not-real'});
  assert.throws(()=>validateSoleHumanPolicy(policy,{...opts(),ownerLedger:o}),/R66 owner review count/);
});
test('unknown policy fields and erased limits are denied',()=>{
  const extra=clone(policy);extra.unknown='yes';
  assert.throws(()=>validateSoleHumanPolicy(extra,opts()),/unexpected or missing/);
  const unbounded=clone(policy);unbounded.note='Owner controls everything';
  assert.throws(()=>validateSoleHumanPolicy(unbounded,opts()),/limits and non-bypass/);
});
