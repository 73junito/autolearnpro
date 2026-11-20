// C3-R56: deterministic source-only governance and custody checks.
// GitHub review + real human verification are required; never authorizes release.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyIntegrity,manifestFile,reviewFile} from './c3-r55-evidence-integrity.mjs';

export const governanceFile=fileURLToPath(new URL('../../docs/c3-r56/governance-ledger.json',import.meta.url));
const fail=(message)=>{throw Error('C3-R56 governance denied: '+message);};
const check=(value,message)=>{if(!value)fail(message);};
const exact=(obj,keys)=>obj && typeof obj==='object' && !Array.isArray(obj) &&
  JSON.stringify(Object.keys(obj).sort())===JSON.stringify([...keys].sort());
const isoDay=/^\d{4}-\d{2}-\d{2}$/;
const day=(v)=>typeof v==='string' && isoDay.test(v) && !Number.isNaN(Date.parse(v)) &&
  new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const hex=/^[a-f0-9]{64}$/;
const sha=/^[a-f0-9]{40}$/;
const id=/^[a-z][a-z0-9-]{2,100}$/;
const ref=/^https:\/\/github\.com\/73junito\/autolearnpro\/issues\/[1-9]\d*$/;
export const hash=(value)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const registryFields=['id','role','verifiedBy','verificationRef'];
const eventFields=['sequence','eventId','checkId','action','actorId','recordedOn','sourceCommit','evidenceSha256','previousDigest','digest'];
function unsignedEvent(e){
  return Object.fromEntries(eventFields.filter(k=>k!=='digest').map(k=>[k,e[k]]));
}
export function sealEvent(event){
  check(exact(event,eventFields.filter(k=>k!=='digest')),'invalid custody event to seal');
  return {...event,digest:hash(unsignedEvent(event))};
}
export function validateGovernance(manual,reviews,ledger,options={}){
  // R55 validates the R54 data, actual bytes, SHA-256, reviewer separation and signoff.
  verifyIntegrity(manual,reviews,options);
  check(exact(ledger,['schemaVersion','milestone','scope','releaseStatus','certification','manualAuthorization','registry','events','note']),'governance fields missing or unexpected');
  check(ledger.schemaVersion===1 && ledger.milestone==='C3-R56' &&
    ledger.scope==='development-only-synthetic-viewers' &&
    ledger.releaseStatus==='HOLD' && ledger.certification==='NOT_CERTIFIED' &&
    ledger.manualAuthorization==='NOT_GRANTED','release authority or scope altered');
  check(Array.isArray(ledger.registry) && Array.isArray(ledger.events),'registry/events missing');
  const people=new Map();
  for(const person of ledger.registry){
    check(exact(person,registryFields),'invalid identity registry fields');
    check(typeof person.id==='string' && id.test(person.id) && !people.has(person.id),'duplicate/invalid identity');
    check(['TESTER','REVIEWER'].includes(person.role),'invalid identity role');
    check(typeof person.verifiedBy==='string' && id.test(person.verifiedBy) &&
      person.verifiedBy!==person.id,'missing independent identity verifier');
    check(typeof person.verificationRef==='string' && ref.test(person.verificationRef),'missing human identity verification reference');
    people.set(person.id,person);
  }
  const byCheck=new Map(manual.checks.map(c=>[c.id,c]));
  const byReview=new Map(reviews.reviews.map(r=>[r.checkId,r]));
  const seenEvents=new Set(), stage=new Map();
  let previous='0'.repeat(64);
  for(const [index,e] of ledger.events.entries()){
    check(exact(e,eventFields),'malformed custody event');
    check(Number.isSafeInteger(e.sequence) && e.sequence===index+1,'custody sequence changed');
    check(typeof e.eventId==='string' && id.test(e.eventId) && !seenEvents.has(e.eventId),'duplicated custody event ID');
    seenEvents.add(e.eventId);
    check(byCheck.has(e.checkId),'unknown test case');
    const test=byCheck.get(e.checkId);
    check(test.status!=='NOT_TESTED','cannot submit or review untested case');
    check(['SUBMITTED','REVIEWED','REJECTED'].includes(e.action),'unsupported event action');
    check(typeof e.actorId==='string' && people.has(e.actorId),'unregistered custody actor');
    check(day(e.recordedOn) && day(test.testedOn) && e.recordedOn>=test.testedOn,'invalid custody chronology');
    check(typeof e.sourceCommit==='string' && sha.test(e.sourceCommit),'source revision must be exact 40-character commit');
    check(Array.isArray(e.evidenceSha256) && e.evidenceSha256.length===test.evidence.length &&
      e.evidenceSha256.every((h,i)=>typeof h==='string' && hex.test(h) && h===test.evidence[i].sha256),
      'custody evidence digest mismatch');
    check(e.previousDigest===previous && typeof e.digest==='string' &&
      hex.test(e.digest) && e.digest===hash(unsignedEvent(e)),'custody hash-chain broken');
    previous=e.digest;
    const prior=stage.get(e.checkId);
    if(e.action==='SUBMITTED'){
      check(!prior && people.get(e.actorId).role==='TESTER' && test.tester===e.actorId,'invalid tester submission');
      stage.set(e.checkId,{phase:'SUBMITTED',sourceCommit:e.sourceCommit,date:e.recordedOn});
    }else{
      check(prior?.phase==='SUBMITTED','review must follow one submission');
      check(people.get(e.actorId).role==='REVIEWER' && e.actorId!==test.tester,'reviewer must be independent');
      const review=byReview.get(e.checkId);
      check(review && review.reviewer===e.actorId && review.reviewedOn===e.recordedOn &&
        review.reviewedOn>=prior.date,'review ledger does not corroborate custody event');
      check(e.sourceCommit===prior.sourceCommit,'test revision changed during review');
      check((e.action==='REVIEWED' && review.decision==='APPROVED' && test.status==='PASS') ||
        (e.action==='REJECTED' && review.decision==='REJECTED' && test.status!=='PASS'),
        'review outcome conflicts with human review');
      stage.set(e.checkId,{phase:e.action,sourceCommit:e.sourceCommit,date:e.recordedOn});
    }
  }
  for(const test of manual.checks){
    const state=stage.get(test.id);
    if(test.status==='NOT_TESTED')check(!state,'untested check has custody events');
    else check(state && state.phase!=='SUBMITTED','completed check missing reviewed/rejected custody');
  }
  check(typeof ledger.note==='string' && ledger.note.length>=20,'governance limitations missing');
  return {milestone:'C3-R56',registeredIdentities:people.size,custodyEvents:ledger.events.length,
    completed:manual.checks.filter(c=>c.status!=='NOT_TESTED').length,
    releaseStatus:'HOLD',certification:'NOT_CERTIFIED',manualAuthorization:'NOT_GRANTED'};
}
export function verifyGovernanceFiles(){
  return validateGovernance(
    JSON.parse(fs.readFileSync(manifestFile,'utf8')),
    JSON.parse(fs.readFileSync(reviewFile,'utf8')),
    JSON.parse(fs.readFileSync(governanceFile,'utf8'))
  );
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  check(process.argv.length===3 && process.argv[2]==='--check','usage: --check');
  const result=verifyGovernanceFiles();
  console.log('C3-R56 governance PASS: '+result.completed+'/6 manually tested; '+
    result.custodyEvents+' custody events; release HOLD');
}
