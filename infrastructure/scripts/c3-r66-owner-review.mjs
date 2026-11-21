// C3-R66 — solo-owner internal manual review gate; NEVER represents independent review or grants release.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {requiredIds} from './c3-r54-manual-evidence.mjs';

export const repoRoot=fileURLToPath(new URL('../../',import.meta.url));
export const reviewFile=path.join(repoRoot,'docs/c3-r66/owner-review-ledger.json');
const safeId=/^[a-z][a-z0-9-]{2,100}$/;
const hex=/^[a-f0-9]{64}$/;
const day=(s)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
  !Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const fail=(m)=>{throw Error('C3-R66 owner review denied: '+m);};
const requireValue=(c,m)=>{if(!c)fail(m);};
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&
  JSON.stringify(Object.keys(x).sort())===JSON.stringify(keys.slice().sort());
const sha=(b)=>createHash('sha256').update(b).digest('hex');

// Owner review is an internal assessment: it never updates R54–R56 and it never means independent acceptance.
export function validateOwnerReview(ledger,{root=repoRoot}={}){
  requireValue(exact(ledger,['schemaVersion','milestone','scope','reviewMode','releaseStatus','certification','manualAuthorization','entries','note']),'invalid ledger shape');
  requireValue(ledger.schemaVersion===1&&ledger.milestone==='C3-R66'&&
    ledger.scope==='development-only-synthetic-viewers'&&ledger.reviewMode==='SOLE_OWNER_NOT_INDEPENDENT'&&
    ledger.releaseStatus==='HOLD'&&ledger.certification==='NOT_CERTIFIED'&&
    ledger.manualAuthorization==='NOT_GRANTED','release or scope controls changed');
  requireValue(typeof ledger.note==='string'&&ledger.note.length>=25,'limitations not documented');
  requireValue(Array.isArray(ledger.entries),'entries must be a list');
  const seen=new Set();
  for(const e of ledger.entries){
    requireValue(exact(e,['caseId','tester','reviewer','testedOn','reviewedOn','sourceCommit','outcome','observations','ownerAttestation','evidence']),'malformed owner entry');
    requireValue(requiredIds.includes(e.caseId)&&!seen.has(e.caseId),'unknown or duplicate case');
    seen.add(e.caseId);
    requireValue(safeId.test(e.tester)&&e.tester===e.reviewer,'owner identity not same tester/reviewer');
    requireValue(day(e.testedOn)&&day(e.reviewedOn)&&e.reviewedOn>=e.testedOn,'invalid chronology');
    requireValue(typeof e.sourceCommit==='string'&&/^[a-f0-9]{40}$/.test(e.sourceCommit),'source commit missing');
    requireValue(['OWNER_REVIEWED','INCONCLUSIVE','FAIL','BLOCKED'].includes(e.outcome),'invalid owner outcome');
    requireValue(typeof e.observations==='string'&&e.observations.trim().length>=30,'substantive observations missing');
    requireValue(typeof e.ownerAttestation==='string'&&e.ownerAttestation.trim().length>=40&&
      /\bI\b/.test(e.ownerAttestation),'explicit first-person owner attestation missing');
    requireValue(Array.isArray(e.evidence)&&e.evidence.length>0,'original source evidence missing');
    const refs=new Set();
    for(const item of e.evidence){
      requireValue(exact(item,['reference','sha256']),'invalid evidence entry');
      requireValue(typeof item.reference==='string'&&
        /^C3-R58-OWNER-SESSIONS\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(item.reference),
        'unscoped owner evidence reference');
      requireValue(!refs.has(item.reference),'duplicate evidence reference');
      refs.add(item.reference);
      let current=path.resolve(root);
      requireValue(fs.lstatSync(current).isDirectory()&&!fs.lstatSync(current).isSymbolicLink(),'invalid root');
      for(const component of item.reference.split('/')){
        current=path.join(current,component);
        let stat;
        try{stat=fs.lstatSync(current);}catch{fail('missing evidence file');}
        requireValue(!stat.isSymbolicLink(),'symlink evidence forbidden');
      }
      const stat=fs.statSync(current);
      requireValue(stat.isFile()&&stat.size>0&&stat.size<=256*1024,'invalid evidence file');
      requireValue(typeof item.sha256==='string'&&hex.test(item.sha256)&&
        sha(fs.readFileSync(current))===item.sha256,'evidence SHA-256 mismatch');
    }
  }
  return {milestone:'C3-R66',internalOwnerReviews:ledger.entries.length,independentlyReviewed:0,
    releaseStatus:'HOLD',certification:'NOT_CERTIFIED',manualAuthorization:'NOT_GRANTED'};
}
export function verifyOwnerReviewFiles(){
  return validateOwnerReview(JSON.parse(fs.readFileSync(reviewFile,'utf8')));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  requireValue(process.argv.length===3&&process.argv[2]==='--check','usage: --check');
  const result=verifyOwnerReviewFiles();
  console.log('C3-R66 solo owner gate PASS: '+result.internalOwnerReviews+' owner review(s), 0 independent, release HOLD');
}
