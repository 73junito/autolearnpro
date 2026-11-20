// C3-R55 — offline, fail-closed integrity gate. Never authorizes release.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateManualEvidence,requiredIds} from './c3-r54-manual-evidence.mjs';

export const repoRoot=fileURLToPath(new URL('../../',import.meta.url));
export const manifestFile=path.join(repoRoot,'docs/c3-r54/manual-accessibility-evidence.json');
export const reviewFile=path.join(repoRoot,'docs/c3-r55/manual-reviews.json');
const reject=(reason)=>{throw Error('C3-R55 evidence denied: '+reason);};
const requireValue=(ok,reason)=>{if(!ok)reject(reason);};
const hex64=/^[a-f0-9]{64}$/;
const idPattern=/^[a-z][a-z0-9-]{2,100}$/;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const safeDate=(d)=>typeof d==='string' && datePattern.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const digest=(bytes)=>createHash('sha256').update(bytes).digest('hex');

// Disallow path traversal, symlink ancestors, symlink files and non-regular files.
// The base directory is separately injected for negative tests only, never through CLI.
export function readEvidence(reference,{root=repoRoot}={}){
  requireValue(typeof reference==='string' &&
    /^docs\/c3-r54\/evidence\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(reference),
    'unsafe or unscoped evidence path');
  const base=path.resolve(root);
  requireValue(fs.lstatSync(base).isDirectory() && !fs.lstatSync(base).isSymbolicLink(),'invalid repository root');
  const parts=reference.split('/');
  let current=base;
  for(let i=0;i<parts.length;i++){
    current=path.join(current,parts[i]);
    const stat=fs.lstatSync(current);
    requireValue(!stat.isSymbolicLink(),'symlink evidence path');
    requireValue(i===parts.length-1?stat.isFile():stat.isDirectory(),'not a regular evidence file');
  }
  requireValue(path.resolve(current).startsWith(base+path.sep),'evidence escaped repository');
  const stat=fs.statSync(current);
  requireValue(stat.size>0 && stat.size<=256*1024,'invalid evidence file size');
  return fs.readFileSync(current);
}

const reviewFields=['checkId','reviewer','reviewedOn','decision','evidenceSha256','notes'];
export function verifyIntegrity(manifest,reviews,{root=repoRoot,readFile=readEvidence}={}){
  validateManualEvidence(manifest);
  requireValue(reviews && typeof reviews==='object' && !Array.isArray(reviews) &&
    reviews.schemaVersion===1 && reviews.milestone==='C3-R55' &&
    reviews.releaseStatus==='HOLD' && reviews.certification==='NOT_CERTIFIED' &&
    reviews.manualAuthorization==='NOT_GRANTED' && Array.isArray(reviews.reviews),'review control missing');
  const checks=new Map(manifest.checks.map(c=>[c.id,c]));
  requireValue(checks.size===requiredIds.length,'missing manual test');
  const seenReferences=new Set();
  const reviewed=new Map();
  for(const row of reviews.reviews){
    requireValue(row && typeof row==='object' && Object.keys(row).sort().join('|')===reviewFields.slice().sort().join('|'),'malformed reviewer attestation');
    requireValue(typeof row.checkId==='string' && checks.has(row.checkId) && !reviewed.has(row.checkId),'unknown or duplicate review');
    const c=checks.get(row.checkId);
    requireValue(c.status!=='NOT_TESTED','review cannot certify untested case');
    requireValue(typeof row.reviewer==='string' && idPattern.test(row.reviewer) && row.reviewer!==c.tester,'reviewer must differ from tester');
    requireValue(safeDate(row.reviewedOn) && safeDate(c.testedOn) && row.reviewedOn>=c.testedOn,'review chronology invalid');
    requireValue(['APPROVED','REJECTED'].includes(row.decision),'invalid review decision');
    requireValue(typeof row.notes==='string' && row.notes.trim().length>=20,'review reasoning missing');
    requireValue(Array.isArray(row.evidenceSha256) && row.evidenceSha256.length===c.evidence.length,'review evidence count mismatch');
    for(const hash of row.evidenceSha256) requireValue(typeof hash==='string' && hex64.test(hash),'review hash invalid');
    requireValue(row.evidenceSha256.every((h,i)=>h===c.evidence[i].sha256),'review evidence digest mismatch');
    requireValue(c.status==='PASS'?row.decision==='APPROVED':row.decision==='REJECTED','review decision incompatible with test status');
    reviewed.set(row.checkId,row);
  }
  let complete=0;
  for(const c of manifest.checks){
    if(c.status==='NOT_TESTED'){
      requireValue(!reviewed.has(c.id),'reviewed untested case');
      continue;
    }
    complete++;
    requireValue(reviewed.has(c.id),'completed test lacks independent human review');
    requireValue(idPattern.test(c.tester),'invalid tester identifier');
    requireValue(safeDate(c.testedOn),'invalid test date');
    for(const evidence of c.evidence){
      requireValue(!seenReferences.has(evidence.reference),'duplicate evidence reference');
      seenReferences.add(evidence.reference);
      let bytes;
      try {bytes=readFile(evidence.reference,{root});} catch(e){reject('missing or unsafe evidence file: '+e.message);}
      requireValue(Buffer.isBuffer(bytes),'invalid file content');
      requireValue(hex64.test(evidence.sha256) && digest(bytes)===evidence.sha256,'evidence file hash mismatch');
    }
  }
  requireValue(reviewed.size===complete,'unmatched reviewer decision');
  return {milestone:'C3-R55',evidenceFiles:seenReferences.size,recordedCompleted:complete,
    independentlyReviewed:reviewed.size,releaseStatus:'HOLD',certification:'NOT_CERTIFIED',manualAuthorization:'NOT_GRANTED'};
}
export function verifyFiles(){
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  const reviews=JSON.parse(fs.readFileSync(reviewFile,'utf8'));
  return verifyIntegrity(manifest,reviews);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  requireValue(process.argv.length===3 && process.argv[2]==='--check','usage: --check');
  const result=verifyFiles();
  console.log('C3-R55 source-only evidence integrity PASS: '+result.recordedCompleted+'/6 recorded, '+result.evidenceFiles+' files, release HOLD');
}
